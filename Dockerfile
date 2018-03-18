FROM node:9


RUN mkdir /signalign
WORKDIR /signalign

COPY . /signalign
COPY package.json /signalign
COPY package-lock.json /signalign
RUN npm install
RUN npm install socket.io express
CMD ["node", "signaling-server.js"]
EXPOSE 8444
#CMD ["node", "index.js"]
