FROM node:18-alpine

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source code
COPY . .

# Set build-time API environment variable
ARG NEXT_PUBLIC_API_URL=http://localhost:8002
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build the optimized production application
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
