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

import fs from 'fs'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import { ApigeeService, ApiManagementInterface, ProxyRevision } from 'apigee-x-module'
import { ApigeeTemplateService, ApigeeGenerator, ApigeeTemplateInput, authTypes } from 'apigee-templater-module'

const apigeeGenerator: ApigeeTemplateService = new ApigeeGenerator()
const apigeeService: ApiManagementInterface = new ApigeeService()

const app = express()

app.use(express.json())
app.use(cors())
app.use(morgan('combined'))
app.use(express.static('public'))

app.post('/apigeegen/deployment/:environment', (req, res) => {
  console.log(JSON.stringify(req.body))
  const env: string = req.params.environment

  if (!env) {
    res.status(400).send(JSON.stringify({
      message: 'Please include an environment to deploy to in the path /apigeegen/deployment/:environment.'
    }))

    return
  }

  const genInput: ApigeeTemplateInput = req.body as ApigeeTemplateInput
  const _proxyDir = './proxies'

  fs.mkdirSync(_proxyDir, { recursive: true })

  apigeeGenerator.generateProxy(genInput, _proxyDir).then(() => {
    apigeeService.updateProxy(genInput.name, _proxyDir + '/' + genInput.name + '.zip').then((updateResult: ProxyRevision) => {
      if (updateResult && updateResult.revision) {
        apigeeService.deployProxyRevision(env, genInput.name, updateResult.revision).then(() => {
          console.log('deploy complete!')
          fs.unlinkSync(_proxyDir + '/' + genInput.name + '.zip')
          res.status(200).send({
            message: `Deployment successful of proxy ${genInput.name} to environment ${env}.`
          })
        }).catch(() => {
          if (fs.existsSync(_proxyDir + '/' + genInput.name + '.zip')) { fs.unlinkSync(_proxyDir + '/' + genInput.name + '.zip') }
          res.status(500).send({
            message: `Error deploying proxy ${genInput.name}, possible the environment doesn't exist?.`
          })
        })
      }
    }).catch((error) => {
      if (fs.existsSync(_proxyDir + '/' + genInput.name + '.zip')) { fs.unlinkSync(_proxyDir + '/' + genInput.name + '.zip') }

      if (error && error.response && error.response.status && error.response.status == 400) {
        res.status(400).send({
          message: `Error deploying ${genInput.name}, bundle has errors.`
        })
      } else {
        res.status(500).send({
          message: `Error deploying ${genInput.name}, general error.`
        })
      }
    })
  }).catch(() => {
    if (fs.existsSync(_proxyDir + '/' + genInput.name + '.zip')) { fs.unlinkSync(_proxyDir + '/' + genInput.name + '.zip') }

    res.status(500).send({
      message: `Error deploying proxy ${genInput.name}.`
    })
  })
})

app.post('/apigeegen/file', (req, res) => {
  console.log(JSON.stringify(req.body))

  const genInput: ApigeeTemplateInput = req.body as ApigeeTemplateInput
  const _proxyDir = './proxies'

  fs.mkdirSync(_proxyDir, { recursive: true })

  apigeeGenerator.generateProxy(genInput, _proxyDir).then(() => {
    res.attachment(genInput.name + '.zip').type('zip')
    // Create a readable stream that we can pipe to the response object
    const readStream = fs.createReadStream(_proxyDir + '/' + genInput.name + '.zip')
    // When everything has been read from the stream, end the response
    readStream.on('close', () => {
      // delete file and return
      fs.unlinkSync(_proxyDir + '/' + genInput.name + '.zip')
      res.end()
    })
    // Pipe the contents of the readStream directly to the response
    readStream.pipe(res)
  }).catch(() => {
    if (fs.existsSync(_proxyDir + '/' + genInput.name + '.zip')) { fs.unlinkSync(_proxyDir + '/' + genInput.name + '.zip') }

    res.status(500).send({
      message: `Error generating proxy ${genInput.name}.`
    })
  })
})

app.listen(8080, () => {
  return console.log('server is listening on 8080')
})
