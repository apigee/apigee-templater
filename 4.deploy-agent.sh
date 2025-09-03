cd agent
source .venv/bin/activate
adk deploy cloud_run \
--project=$PROJECT_ID \
--region=$REGION \
--service_name="apigee-templater-agent" \
--app_name="apigee-templater-agent" \
--with_ui \
"./apigee-agent"
cd ..
