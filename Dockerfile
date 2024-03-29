# Copyright 2022 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM node:latest

WORKDIR /usr/src/app

COPY service/package*.json ./

RUN npm install

COPY service .
RUN npm run build

COPY client ./client
RUN cd client && npm cache clean --force && npm install && npm run build
RUN cp -rf client/dist/. ./public/

EXPOSE 8080

CMD [ "node", "dist" ]