SECONDS=0
# submit build
gcloud builds submit --tag "$REGION-docker.pkg.dev/$PROJECT_ID/docker-registry/apigee-templater" --project $PROJECT_ID
sed -i "/              value: DEPLOY_DATE_/c\              value: DEPLOY_DATE_$(date +%d-%m-%Y_%H-%M-%S)" cloud-run.local.yaml
# get service url
SERVICE_URL=$(gcloud run services describe apigee-templater --format 'value(status.url)' --region $REGION --project $PROJECT_ID)
# deploy to get url if we don't have it
if [ -z "${SERVICE_URL}" ]; then
    gcloud run services replace cloud-run.local.yaml --project $PROJECT_ID --region $REGION

    SERVICE_URL=$(gcloud run services describe apigee-templater --format 'value(status.url)' --region $REGION --project $PROJECT_ID)
fi
sed -i "/              value: SERVICE_URL_/c\              value: SERVICE_URL_$SERVICE_URL" cloud-run.local.yaml
gcloud run services replace cloud-run.local.yaml --project $PROJECT_ID --region $REGION
echo | gcloud run services set-iam-policy asset-service cloud-run-policy.yaml --project $PROJECT_ID --region $REGION
# set mcp server url in agent .env file
sed -i "s,^APIGEE_TEMPLATER_MCP_URL=.*,APIGEE_TEMPLATER_MCP_URL=$SERVICE_URL/mcp," ./agent/apigee-agent/.env

duration=$SECONDS
echo "Total deployment finished in $((duration / 60)) minutes and $((duration % 60)) seconds."
