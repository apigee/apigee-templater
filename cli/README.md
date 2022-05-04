# Apigee Templater CLI

This CLI uses the apigee-templater-module to offer CLI features for templating out Apigee proxies.

## Getting started

### Install

To install the CLI, simply install globally using NPM.

```sh
# Install and get the help guide
npm install -g apigee-templater-cli
apigee-template -h

# Or run directly with npx
npx apigee-templater-cli -h
```

### Develop and test locally

To develop and test locally, simply go to the /cli directory and run these commands.

```sh
cd cli

# First install cli dependencies
npm i

# build cli module
npm run build

# now link for testing
npm link
```

Now you can run **apigee-template** everywhere from the local cli/bin directly (built version).