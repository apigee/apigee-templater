import { OpenAPIConverterPlugin, authTypes } from "../interfaces.js";

/**
 * Class to convert between a data payload to an OpenAPI spec that supports GET with paging / filters on the data
 */
export class OpenAPIDataConverter implements OpenAPIConverterPlugin {
  convertInput(input: string, servers: string[], authType: authTypes = authTypes.none, addDataExamples: boolean = false, addDataDescriptions: boolean = false, additionalData?: any): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // First convert input to JSON
      let inputJSON = JSON.parse(input);
      addExamples = addDataExamples;
      addDescriptions = addDataDescriptions;

      let result = convert(inputJSON);

      let openAPIResult = `openapi: 3.0.3
info:
  title: ${capitalizeFirstLetter(entityName)} API
  description: This API provides access to ${capitalizeFirstLetter(entityName)} data.
  version: 1.0.0
servers:
${servers.map((server, i) => `  - url: ${server}`)}
${authType === authTypes.apiKey ? `
security:
  - ApiKeyAuth: []` : ""}
paths:
  /${entityName}:
    get:
      responses:
        '200':
          description: 'Success'
          content:
            application/json:
              schema:
                type: object
                properties:
                  ${entityName}:
                    type: array
                    items:
                      $ref: '#/components/schemas/${entityName}'
                  next_page_token:
                    $ref: '#/components/schemas/next_page_token'
components:
${authType === authTypes.apiKey ? `
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      name: apikey
      in: query`
: ""}
${result}
`;
      resolve(openAPIResult);
    });
  }
}

let tabCount = 0;
let indentator = "\n";
let addExamples = false;
let addDescriptions = false;
let outSwagger = '"  schemas": {';
let entityName = "";

function convert(input: any): string {
  changeIndentation(2);

  //For each object inside the JSON
  for (var obj in input) {
    if (!entityName) entityName = obj;
    // ---- Begin schema scope ----
    outSwagger += indentator + '"' + obj + '": {';
    conversorSelection(input[obj], obj);
    outSwagger += indentator + "},";
    // ---- End schema scope ----
  }
  //Remove last comma
  outSwagger = outSwagger.substring(0, outSwagger.length - 1);
  // ---- End definitions ----
  changeIndentation(tabCount - 1);
  outSwagger += indentator + "}";

  return convertToYaml(outSwagger);
}

function changeIndentation(count: number) {
  let i;
  if (count >= tabCount) {
    i = tabCount;
  } else {
    i = 0;
    indentator = "\n";
  }
  for (; i < count; i++) {
    indentator += "\t";
  }
  //Update tabCount
  tabCount = count;
}

function conversorSelection(obj: any, propName: string = "") {

  changeIndentation(tabCount + 1);

  if (typeof obj === "number") {
    //attribute is a number
    convertNumber(obj, propName);
  } else if (Object.prototype.toString.call(obj) === "[object Array]") {
    //attribute is an array
    convertArray(obj, propName);
  } else if (typeof obj === "object") {
    //attribute is an object
    convertObject(obj, propName);
  } else if (typeof obj === "string") {
    //attribute is a string
    convertString(obj, propName);
  } else if (typeof obj === "boolean") {
    // attribute is a boolean
    outSwagger += indentator + '"type": "boolean"';
    if (propName)
      outSwagger += indentator + '"description": "The ' + propName + ' flag for the object." }';
  } else {
    // not a valid Swagger type
    console.error('Property type "' + typeof obj + '" not valid for Swagger definitions');
  }

  changeIndentation(tabCount - 1);
}

function convertNumber(num: number, propName: string = "") {
  /* 
  Append to 'outSwagger' string with Swagger schema attributes relative to given number
  Global variables updated: 
  -outSwagger
  */

  if (num % 1 === 0) {
    outSwagger += indentator + '"type": "integer",';
    if (num < 2147483647 && num > -2147483647) {
      outSwagger += indentator + '"format": "int32"';
    } else if (Number.isSafeInteger(num)) {
      outSwagger += indentator + '"format": "int64"';
    } else {
      outSwagger += indentator + '"format": "unsafe"';
    }
  } else {
    outSwagger += indentator + '"type": "number"';
  }

  if (propName)
    outSwagger += indentator + '"description": "The ' + propName + ' number." }';

  if (addExamples) {
    //Log example if checkbox is checked
    outSwagger += "," + indentator + '"example": "' + num + '"';
  }
}

function convertString(str: string, propName: string = "") {

  let regxDate = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/,
    regxDateTime =
      /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01]).([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,3})?(Z|(\+|\-)([0-1][0-9]|2[0-3]):[0-5][0-9])$/;

  outSwagger += indentator + '"type": "string"';

  if (propName)
    outSwagger += indentator + '"description": "The ' + propName + ' tag for the object." }';

  if (regxDateTime.test(str)) {
    outSwagger += ",";
    outSwagger += indentator + '"format": "date-time"';
  } else if (regxDate.test(str)) {
    outSwagger += ",";
    outSwagger += indentator + '"format": "date"';
  }
  if (addExamples) {
    //Log example if checkbox is checked
    outSwagger += "," + indentator + '"example": "' + str + '"';
  }
}

function convertArray(obj: any, propName: string = "") {

  let schema: {[key: string]: string} = {};
  let examples = new Set();
  for (const entry of obj) {
    for (const key of Object.keys(entry)) {
      if (!Object.keys(schema).includes(key)) {
        //examples.add(entry[key]);
        schema[key] = entry[key];
      }
    }
  }

  outSwagger += indentator + '"type": "array",';
  if (propName)
    outSwagger += indentator + '"description": "The ' + propName + ' array for the object." }';

  // ---- Begin items scope ----
  outSwagger += indentator + '"items": {';
  conversorSelection(schema);
  outSwagger += indentator + "}";

  // ---- End items scope ----
  // ---- Begin example scope ----
  // No examples for arrays
  // if (addExamples) {
  //   outSwagger += ","
  //   outSwagger += indentator + '"example": ' + JSON.stringify(
  //     Array.from(examples), null, '\t'
  //   ).replaceAll('\n', indentator)
  // }
  // ---- End example scope ----
}

function convertObject(obj: any, propName: String = "") {
  //Convert null attributes to given type
  if (obj === null) {
    outSwagger +=
      indentator +
      '"type": "string",';
    outSwagger += indentator + '"format": "nullable"';
  }

  // ---- Begin properties scope ----
  outSwagger += indentator + '"type": "object",';
  outSwagger += indentator + '"description": "object",';
  outSwagger += indentator + '"properties": {';
  changeIndentation(tabCount + 1);
  //For each attribute inside that object
  for (var prop in obj) {
    // ---- Begin property type scope ----
    outSwagger += indentator + '"' + prop + '": {';
    conversorSelection(obj[prop], prop);
    outSwagger += indentator + "},";
    // ---- End property type scope ----
  }

changeIndentation(tabCount - 1);
  if (Object.keys(obj).length > 0) {
    //At least 1 property inserted
    outSwagger = outSwagger.substring(0, outSwagger.length - 1); //Remove last comma
    outSwagger += indentator + "}";
  } else {
    // No property inserted
    outSwagger += " }";
  }
}

function convertToYaml(value: string) {
  return value
    .replace(/[{},"]+/g, "")
    .replace(/\t/g, "  ")
    .replace(/(^ *\n)/gm, "");
}

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}