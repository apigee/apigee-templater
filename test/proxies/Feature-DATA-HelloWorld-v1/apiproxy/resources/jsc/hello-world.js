var responseObject = response.content.asJSON;

if (responseObject) {
  var message = context.getVariable("request.queryparam.message");
  if (!message)
    message = context.getVariable("propertyset.helloworld.MESSAGE");
  if (!message)
    message = "Hello world!";
  responseObject["message"] = message;
  context.setVariable("response.content", JSON.stringify(responseObject))
}