SECONDS=0
gcloud builds submit --tag "$REGION-docker.pkg.dev/$PROJECT_ID/docker-registry/apigee-templater" --project $PROJECT_ID
sed -i "/              value: DEPLOY_DATE_/c\              value: DEPLOY_DATE_$(date +%d-%m-%Y_%H-%M-%S)" cloud-run.local.yaml
gcloud run services replace cloud-run.local.yaml --project $PROJECT_ID --region $REGION
echo | gcloud run services set-iam-policy asset-service cloud-run-policy.yaml --project $PROJECT_ID --region $REGION
duration=$SECONDS
echo "Total deployment finished in $((duration / 60)) minutes and $((duration % 60)) seconds."
