# get service url
SERVICE_URL=$(gcloud run services describe apigee-templater --format 'value(status.url)' --region $REGION --project $PROJECT_ID)
# set correct mcp url in env file
sed -i "s,^APIGEE_TEMPLATER_MCP_URL=.*,APIGEE_TEMPLATER_MCP_URL=$SERVICE_URL/mcp," ./agent/apigee_templater_agent/.env

cd agent
source .venv/bin/activate
# deploy apigee templater agent
adk deploy cloud_run \
--project=$PROJECT_ID \
--region=$REGION \
--service_name="apigee-templater-agent" \
--app_name="apigee_templater_agent" \
--allow_origins="*" \
--with_ui \
"./apigee_templater_agent"

# deploy apigee user agent
adk deploy cloud_run \
--project=$PROJECT_ID \
--region=$REGION \
--service_name="apigee-user-agent" \
--app_name="apigee_user_agent" \
--allow_origins="*" \
--with_ui \
"./apigee_user_agent"
cd ..
