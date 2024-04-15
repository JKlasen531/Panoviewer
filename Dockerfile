FROM node:8.16.0-alpine

COPY . /openvslam-panoviewer/

RUN apk add  --no-cache ffmpeg
RUN set -x && \
  cd /openvslam-panoviewer/ && \
  npm install

ENTRYPOINT ["node", "/openvslam-panoviewer/app.js"]
