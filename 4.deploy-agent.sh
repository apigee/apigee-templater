cd agent
source .venv/bin/activate
adk deploy cloud_run \
--project=$PROJECT_ID \
--region=$REGION \
--service_name="apigee-templater-agent" \
--app_name="apigee_templater_agent" \
--with_ui \
"./apigee_templater_agent"
cd ..
