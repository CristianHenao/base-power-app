FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
# ponytail: next dev so compose up stays usable; switch to next build/start when shipping images
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
