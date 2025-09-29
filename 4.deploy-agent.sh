# get service url
SERVICE_URL=$(gcloud run services describe apigee-templater --format 'value(status.url)' --region $REGION --project $PROJECT_ID)
# set correct mcp url in env file
sed -i "s,^export APIGEE_TEMPLATER_MCP_URL=.*,export APIGEE_TEMPLATER_MCP_URL=$SERVICE_URL," ./agent/.env

cd agent
source .venv/bin/activate
source .env

gcloud run deploy apigee-templater-agent \
--source . \
--region $GOOGLE_CLOUD_LOCATION \
--project $GOOGLE_CLOUD_PROJECT \
--allow-unauthenticated --cpu-boost --cpu 4 --memory 4Gi \
--set-env-vars="GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,GOOGLE_CLOUD_LOCATION=$GOOGLE_CLOUD_LOCATION,GOOGLE_GENAI_USE_VERTEXAI=TRUE,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET,APIGEE_TEMPLATER_MCP_URL=$APIGEE_TEMPLATER_MCP_URL"
cd ..
