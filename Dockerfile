# Dockerfile for testing Linux builds locally
# Usage:
#   docker build -t tauri-builder .
#   docker run --rm -v ${PWD}:/app -v /app/node_modules -v /app/src-tauri/target tauri-builder

FROM ubuntu:20.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    build-essential \
    libgtk-3-dev \
    libwebkit2gtk-4.0-dev \
    libappindicator3-dev \
    librsvg2-dev \
    patchelf \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install npm dependencies in container
RUN npm ci

# Copy source files
COPY . .

# Build command
CMD ["npm", "run", "build"]
