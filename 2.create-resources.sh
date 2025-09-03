# create unique storage bucket name
RANDOM_SUFFIX=$(head /dev/urandom | tr -dc a-z0-9 | head -c5)
BUCKET_NAME="templater-$RANDOM_SUFFIX"
echo "Your storage bucket name is: $BUCKET_NAME, add to your 1_env.sh file"
PROJECTNUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$PROJECTNUMBER-compute@developer.gserviceaccount.com" --role='roles/storage.admin'
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$PROJECTNUMBER-compute@developer.gserviceaccount.com" --role='roles/artifactregistry.writer'
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$PROJECTNUMBER-compute@developer.gserviceaccount.com" --role='roles/logging.logWriter'
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$PROJECTNUMBER-compute@developer.gserviceaccount.com" --role='roles/run.builder'

gcloud storage buckets create gs://$BUCKET_NAME --location=$REGION --project $PROJECT_ID
gcloud artifacts repositories create docker-registry --repository-format=docker \
  --location="$REGION" --description="Asset registry" --project="$PROJECT_ID"

cp cloud-run.yaml cloud-run.local.yaml
sed -i "/        - image: /c\        - image: $REGION-docker.pkg.dev/$PROJECT_ID/docker-registry/apigee-templater" cloud-run.local.yaml
sed -i "/              bucketName: /c\              bucketName: $BUCKET_NAME" cloud-run.local.yaml
