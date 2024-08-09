/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import arg from 'arg'
import fs from 'fs'
import { performance } from 'perf_hooks'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { ApigeeTemplateInput, ApigeeTemplateService, ApigeeTemplater, GenerateResult, SpecType, authTypes } from 'apigee-templater-module'
import { ApigeeService, ApiManagementInterface, EnvironmentGroup, EnvironmentGroupAttachment, ProxyDeployment, ProxyRevision } from 'apigee-x-module'

import axios from 'axios';
import { stdin } from 'process'

process.on('uncaughtException', function (e) {
  if (e.message.includes("Unable to detect a Project Id in the current environment")) {
    console.error(`${chalk.redBright('! Error: No project with Apigee enabled was found to deploy to, either set a default project using gcloud or pass the -p parameter with a valid project Id.')}`);
  }
  else
    console.error(`${chalk.redBright('! Error: An unexpected error occurred. ' + e.message)}`);
});

/**
 * The CLI class parses and collects the user inputs, and generates / depoys the proxy on-demand.
 * @date 1/31/2022 - 8:47:32 AM
 *
 * @export
 * @class cli
 * @typedef {cli}
 */
export class cli {
  /**
   * The ApigeeService object, using default application credentials
   * @date 3/16/2022 - 11:20:23 AM
   *
   * @type {ApiManagementInterface}
   */
  apigeeService: ApiManagementInterface = new ApigeeService();

  /**
   * The ApigeeGenerator object using the default profile of plugins
   * @date 3/16/2022 - 11:20:50 AM
   *
   * @type {ApigeeTemplateService}
   */
  apigeeTemplater: ApigeeTemplateService;

  /**
   * Constructor 
   * @param name 
   */
  constructor(templaterInstance?: ApigeeTemplateService) {
    if (templaterInstance)
      this.apigeeTemplater = templaterInstance;
    else
      this.apigeeTemplater = new ApigeeTemplater();
  }

  /**
   * Parses the user inputs
   * @date 1/31/2022 - 8:47:02 AM
   *
   * @param {cliArgs} rawArgs The command line arguments
   * @return {cliArgs}} Processed arguments
   */
  parseArgumentsIntoOptions(rawArgs: string[]): cliArgs {
    const args = arg(
      {
        '--file': String,
        '--input': String,
        '--deploy': Boolean,
        '--deployServiceAccount': String,
        '--environment': String,
        '--project': String,
        '--filter': String,
        '--name': String,
        '--basePath': String,
        '--apiKey': Boolean,
        '--targetUrl': String,
        '--targetBigQueryTable': String,
        '--verbose': Boolean,
        '--keyPath': String,
        '--help': Boolean,
        '-f': '--file',
        '-i': '--input',
        '-d': '--deploy',
        '-s': '--deployServiceAccount',
        '-e': '--environment',
        '-p': '--project',
        '-l': '--filter',
        '-n': '--name',
        '-b': '--basePath',
        '-a': '--apiKey',
        '-t': '--targetUrl',
        '-q': '--targetBigQueryTable',
        '-v': '--verbose',
        '-k': '--keyPath',
        '-h': '--help'
      },
      {
        argv: rawArgs.slice(2)
      }
    )
    return {
      file: args['--file'] || '',
      input: args['--input'] || '',
      deploy: args['--deploy'] || false,
      deployServiceAccount: args['--deployServiceAccount'] || '',
      environment: args['--environment'] || '',
      project: args['--project'] || '',
      filter: args['--filter'] || '',
      name: args['--name'] || '',
      basePath: args['--basePath'] || '',
      apiKey: args['--apiKey'] || false,
      targetUrl: args['--targetUrl'] || '',
      targetBigQueryTable: args['--targetBigQueryTable'] || '',
      verbose: args['--verbose'] || false,
      keyPath: args['--keyPath'] || '',
      help: args['--help'] || false
    }
  }

  /**
   * Prompts the user for any missing inputs
   * @param {cliArgs} options The options collection of user inputs
   * @return {cliArgs} Updated cliArgs options collection
   */
  async promptForMissingOptions(options: cliArgs): Promise<cliArgs> {
    const questions = []
    if (!options.name) {
      questions.push({
        type: 'input',
        name: 'name',
        message: 'What should the proxy be called?',
        default: 'MyProxy',
        transformer: (input: string) => {
          return input.replace(/ /g, '-')
        }
      })
    }

    if (!options.basePath) {
      questions.push({
        type: 'input',
        name: 'basePath',
        message: 'Which base path should be used?',
        transformer: (input: string) => {
          return `/${input}`
        }
      })
    }

    if (!options.targetUrl) {
      questions.push({
        type: 'input',
        name: 'targetUrl',
        message: 'Which backend target URL should be called?',
        transformer: (input: string) => {
          return `https://${input}`
        }
      })
    }

    if (!options.deploy) {
      questions.push({
        type: 'confirm',
        name: 'deploy',
        message: 'Do you want to deploy the proxy to an Apigee X environment?'
      })
    }

    if (!options.environment) {
      questions.push({
        type: 'input',
        name: 'environment',
        message: 'Which Apigee X environment to you want to deploy to?',
        when: (answers: cliArgs) => {
          return answers.deploy
        }
      })
    }

    const answers = await inquirer.prompt(questions)

    if (answers.basePath && !answers.basePath.startsWith('/')) { answers.basePath = '/' + answers.basePath }
    if (answers.targetUrl && !answers.targetUrl.startsWith('https://')) { answers.targetUrl = 'https://' + answers.targetUrl }

    return {
      ...options,
      name: options.name || answers.name,
      basePath: options.basePath || answers.basePath,
      targetUrl: options.targetUrl || answers.targetUrl,
      deploy: options.deploy || answers.deploy,
      environment: options.environment || answers.environment,
      keyPath: options.keyPath || answers.keyPath
    }
  }

  /**
   * Prints example and full commands
   **/
  printHelp() {
    console.log('')
    console.log(`${chalk.bold(chalk.magentaBright('> Simple examples:'))}`)
    console.log(`> apigee-templater ${chalk.italic(chalk.magentaBright('# Start interactive mode to enter the parameters.'))}`)
    console.log(`> apigee-templater -n TestProxy -b /httpbin -t https://httpbin.org' ${chalk.italic(chalk.magentaBright('# Create a proxy called TestProxy with the base path /test to target https://httpbin.org > will produce a TestProxy.zip bundle.'))}`)
    console.log(`> apigee-templater -n TestProxy -b /httpbin -t https://httpbin.org -d -e test1' ${chalk.italic(chalk.magentaBright("# Create a proxy called TestProxy and deploy to the Apigee X environment 'test1'."))}`)
    console.log(`> apigee-templater -f ./PetStore.yaml -d -e test1' ${chalk.italic(chalk.magentaBright("# Create a proxy based on the PetStore.yaml file and deploy to environment 'test1'"))}`)

    console.log('')
    console.log(`${chalk.bold(chalk.magentaBright('All parameters:'))}`)
    for (const line of helpCommands) {
      console.log(`${line.name}: ${chalk.italic(chalk.magentaBright(line.description))} `)
    }
  }

  processDataSpec(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let receivedData = '';
      stdin.on('data', (data) => {
        receivedData += data;
      });
      stdin.on('end', () => {
        // Input will have a \n appended
        // receivedData = receivedData.slice(0, -1);
        resolve(receivedData);
      });
    });
  }

  /**
   * Process the user inputs and generates / deploys the proxy
   * @date 1/31/2022 - 8:42:28 AM
   *
   * @async
   * @param {cliArgs} args The user input args to the process
   */
  async process(args: string[]) {

    if (!stdin.setRawMode) {
      // We have received raw data piped in, so do our spec generation
      let payloadInput = await this.processDataSpec();

      let servers: string[] = [];
      let addExamples = false;
      let addDescriptions = false;
      let auth = authTypes.none;
      for (let argIndex=0; argIndex<args.length; argIndex++) {
        if (args[argIndex] === "-s" && argIndex < (args.length - 1))
          servers.push(args[argIndex + 1]);
        else if (args[argIndex] === "-ad")
          addDescriptions = true;
        else if (args[argIndex] === "-ae")
          addExamples = true;
        else if (args[argIndex] === "-a")
          auth = authTypes.apiKey;
      }

      let specResult = await this.apigeeTemplater.generateSpec(payloadInput, SpecType.Data, servers, auth, addExamples, addDescriptions);
      console.log(specResult);
      
      return;
    }

    let options: cliArgs = this.parseArgumentsIntoOptions(args);
    if (options.verbose && fs.existsSync("apigee-templater-log.txt")) {
      // Delete old log file, if it exists
      fs.unlinkSync("apigee-templater-log.txt")  
    }

    if (options.keyPath) process.env.GOOGLE_APPLICATION_CREDENTIALS = options.keyPath;

    console.log(`${chalk.bold(chalk.magentaBright('> Welcome to Apigee Templater'))}, ${chalk.green('use -h for more command line options.')} `)

    if (options.verbose) this.logVerbose(JSON.stringify(options, null, 2), 'start:');

    if (options.help) {
      this.printHelp();
      return;
    }

    if (options.file) {
      // We have a file input, let's check if local or remote..
      if (options.file.startsWith("https://")) {
        // Remote file, fetch..
        if (options.verbose) this.logVerbose(`Fetching remote file ${options.file}`, 'env:')
        const response = await axios.get(options.file);
        options.input = JSON.stringify(response.data);
      }
      else if (fs.existsSync(options.file)) {
        // Local file
        options.input = fs.readFileSync(options.file, 'utf-8')
      }
    }

    if (!options.input && !options.file) {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) options.keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      // If a BigQuery table was passed in, set it to targetUrl as well to prevent prompts (we have our target)
      if (options.targetBigQueryTable) options.targetUrl = options.targetBigQueryTable;
      try {
        options = await this.promptForMissingOptions(options)
      } catch (error) {
        console.error(`${chalk.redBright('! Error:')} Error during prompt for inputs.`)
        if (options.verbose) this.logVerbose(JSON.stringify(error), 'prompt error:')
      }

      let newInput: ApigeeTemplateInput;

      if (options.targetBigQueryTable)
        newInput = new ApigeeTemplateInput({
          name: options.name,
          profile: "bigquery",
          endpoints: [
            {
              name: 'default',
              basePath: options.basePath,
              target: {
                name: 'default',
                table: options.targetBigQueryTable
              },
              parameters: {},
              extensionSteps: []
            }
          ]
        });
      else
        newInput = new ApigeeTemplateInput({
          name: options.name,
          profile: "default",
          endpoints: [
            {
              name: 'default',
              basePath: options.basePath,
              target: {
                name: 'default',
                url: options.targetUrl
              },
              parameters: {},
              extensionSteps: []
            }
          ]
        });

      if (options.apiKey) {
        newInput.endpoints[0].auth = [
          {
            type: authTypes.apiKey,
            parameters: {}
          }
        ]
      }

      options.input = JSON.stringify(newInput)
    }

    const _proxyDir = '.'
    if (options.project) {
      this.apigeeService.org = options.project;
      process.env.PROJECT = options.project;
    }
    else if (process.env.PROJECT) {
      this.apigeeService.org = process.env.PROJECT;
    }

    if (options.verbose) this.logVerbose(`Project set to ${process.env.PROJECT}`, 'project:')

    if (options.filter) {
      // users can add their own preprocessing filter scripts here
      // eslint-disable-next-line
      eval(fs.readFileSync(options.filter, 'utf-8'))
    }

    if (options.verbose) this.logVerbose(options.input, 'template:')

    this.apigeeTemplater.convertStringToProxyInput(options.input).then((inputTemplate: ApigeeTemplateInput) => {

      if (options.basePath) inputTemplate.endpoints[0].basePath = options.basePath;
      if (options.name) inputTemplate.name = options.name;

      this.apigeeTemplater.generateProxy(inputTemplate, _proxyDir).then((generateResult: GenerateResult) => {
        if (options.verbose) this.logVerbose(JSON.stringify(generateResult, null, 2), 'template result:');
        if (inputTemplate.sharedFlow && generateResult && generateResult.template)
          console.log(`${chalk.green('>')} Flow ${chalk.bold(chalk.blue(generateResult.template.name))} generated to ${chalk.magentaBright(chalk.bold(generateResult.localPath))} in ${chalk.bold(chalk.green(Math.round(generateResult.duration) + ' milliseconds'))}.`);
        else if (generateResult && generateResult.template)
          console.log(`${chalk.green('>')} Proxy ${chalk.bold(chalk.blue(generateResult.template.name))} generated to ${chalk.magentaBright(chalk.bold(generateResult.localPath))} in ${chalk.bold(chalk.green(Math.round(generateResult.duration) + ' milliseconds'))}.`);

        if (options.deploy && !options.environment) {
          console.error(`${chalk.redBright('! Error:')} No environment found to deploy to, please pass the -e parameter with an Apigee X environment.`)
        } else if (options.deploy) {
          const startTime = performance.now()
          try {
            if (generateResult && generateResult.template) {
              if (inputTemplate.sharedFlow) {
                this.apigeeService.updateFlow(generateResult.template.name, _proxyDir + '/' + generateResult.template.name + '.zip').then((updateResult: ProxyRevision) => {
                  if (updateResult && updateResult.revision) {
                    if (generateResult && generateResult.template) {
                      this.apigeeService.deployFlowRevision(options.environment, generateResult.template.name, updateResult.revision, options.deployServiceAccount).then((deployResult: ProxyDeployment) => {
                        const endTime = performance.now()
                        const duration = endTime - startTime
                        if (options.verbose) this.logVerbose(JSON.stringify(generateResult), 'deploy result:');
                        if (generateResult && generateResult.template) {
                          console.log(`${chalk.green('>')} Flow ${chalk.bold(chalk.blue(generateResult.template.name + ' version ' + updateResult.revision))} deployed to environment ${chalk.bold(chalk.magentaBright(options.environment))} in ${chalk.bold(chalk.green(Math.round(duration) + ' milliseconds'))}.`);
                        }
                      });
                    }
                  }
                }).catch((error) => {
                  console.error(`${chalk.redBright('! Error:')} Error deploying flow revision, probably a basepath conflict with an existing proxy.`);
                  if (options.verbose) this.logVerbose(JSON.stringify(error), 'deploy error:');
                });
              }
              else {
                this.apigeeService.updateProxy(generateResult.template.name, _proxyDir + '/' + generateResult.template.name + '.zip').then((updateResult: ProxyRevision) => {
                  if (updateResult && updateResult.revision) {
                    if (generateResult && generateResult.template) {
                      this.apigeeService.deployProxyRevision(options.environment, generateResult.template.name, updateResult.revision, options.deployServiceAccount).then((deployResult: ProxyDeployment) => {
                        const endTime = performance.now();
                        const duration = endTime - startTime;
                        if (options.verbose) this.logVerbose(JSON.stringify(generateResult), 'deploy result:');
                        if (generateResult && generateResult.template) {
                          console.log(`${chalk.green('>')} Proxy ${chalk.bold(chalk.blue(generateResult.template.name + ' version ' + updateResult.revision))} deployed to environment ${chalk.bold(chalk.magentaBright(options.environment))} in ${chalk.bold(chalk.green(Math.round(duration) + ' milliseconds'))}.`)

                          // Now try to get the env group URL
                          this.apigeeService.getEnvironmentGroups().then((result: EnvironmentGroup[]) => {
                            result.forEach((group: EnvironmentGroup) => {
                              this.apigeeService.getEnvironmentGroupAttachments(group.name).then((result => {
                                result.forEach((element: EnvironmentGroupAttachment) => {
                                  if (element.environment === options.environment) {
                                    // Here we have an attachment, to print host URL link
                                    group.hostnames.forEach((hostname: string) => {
                                      if (generateResult.template)
                                        console.log(`${chalk.green('>')} Wait 30-60 seconds, then test here: ${chalk.bold(chalk.blue(`https://${hostname}${generateResult.template.endpoints[0].basePath}`))}`);
                                    });
                                  }
                                });
                              }))
                            });
                          });
                        }

                      }).catch((error) => {
                        console.error(`${chalk.redBright('! Error:')} Error deploying proxy revision, probably a basepath conflict with an existing proxy.`)
                        if (options.verbose) this.logVerbose(JSON.stringify(error), 'deploy error:')
                      })
                    }
                  }
                }).catch((error) => {
                  if (error && error.response && error.response.status && error.response.status === 400) {
                    console.error(`${chalk.redBright('! Error:')} Error in proxy bundle definition, try importing manually for more detailed error information.`)
                  }
                  else {
                    console.error(`${chalk.redBright('! Error:')} Error updating proxy.`)
                  }
                });
              }
            }
          }
          catch (error) {
            console.error(`${chalk.redBright('! Error:')} Error generating proxy.`)
          }
        }
      });
    });
  }

  /**
   * Logs a verbose message to the console
   * @date 1/31/2022 - 8:45:46 AM
   *
   * @param {string} input The text message to log
   * @param {string} label An optional label as prefix label
   */
  logVerbose(input: string, label?: string) {
    let logString: string = '> ' + input + '\n';
    if (label)
      logString = '> ' + label + ' ' + input + '\n';

    console.log(`${chalk.cyanBright(logString)}`);
    fs.appendFile('apigee-templater-log.txt', logString, function (err) {
      if (err)
        console.error(err);
    });
  }
}

/**
 * Class to model the user input collection
 * @date 1/31/2022 - 8:46:19 AM
 *
 * @class cliArgs
 * @typedef {cliArgs}
 */
class cliArgs {
  file = '';
  input = '';
  deploy = false;
  deployServiceAccount = '';
  environment = '';
  project = '';
  filter = '';
  name = '';
  basePath = '';
  apiKey = false;
  targetUrl = '';
  targetBigQueryTable = '';
  verbose = false;
  keyPath = '';
  help = false;
}

/**
 * Collection of the help commands to print on-demand
 * @date 1/31/2022 - 8:46:40 AM
 *
 * @type {{}}
 */
const helpCommands = [
  {
    name: '--file, -f',
    description: 'Path to a JSON or OpenAPIv3 YAML file with a proxy definition.'
  },
  {
    name: '--input, -i',
    description: 'Same as --file, but with the input directly as a string in this parameter.'
  },
  {
    name: '--deploy, -d',
    description: 'Boolean true or false if the generated proxy should also be deployed to an Apigee X environment.'
  },
  {
    name: '--deployServiceAccount, -s',
    description: 'The Google Cloud service account email address to deploy with (used to authenticate or authorize target calls).'
  },
  {
    name: '--environment, -e',
    description: 'If --deploy is true, the environment to deploy the proxy to.'
  },
  {
    name: '--project, -p',
    description: 'The Google Cloud project / Apigee Org to use for the deployment.'
  },
  {
    name: '--filter, -l',
    description: 'Path to an optional javascript file that will be evaluated before any processing is done, can be used to add conversion plugins or inject other logic into the conversion.'
  },
  {
    name: '--name, -n',
    description: 'If no --file or --input parameters are specified, this can set the proxy name directly for a simple proxy.'
  },
  {
    name: '--basePath, -b',
    description: 'If no --file or --input parameters are specified, this can set the basePath directly.'
  },
  {
    name: '--apiKey, -a',
    description: 'If no --file or --input parameters are specified, this can apply an apiKey policy when set to true.'
  },
  {
    name: '--targetUrl, t',
    description: 'If no --file or --input parameters are specified, this can set the target URL directly.'
  },
  {
    name: '--targetBigQueryTable, q',
    description: 'If no --file or --input parameters are specified, this can set a target BigQuery table directly.'
  },
  {
    name: '--verbose, -v',
    description: 'If extra logging information should be printed during the conversion and deployment.'
  },
  {
    name: '--datSpec, -ds',
    description: 'Generates an OpenAPI spec for a data payload that is piped to the command (only GET).'
  },  
  {
    name: '--keyPath, -k',
    description: 'If no GOOGLE_APPLICATION_CREDENTIALS are set to authorize the proxy deployment, this can point to a GCP service account JSON key file to use for authorization.'
  }
]

export default cli;