FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    ca-certificates \
    build-essential \
    gnupg \
    ripgrep \
    fd-find \
    unzip \
    jq \
    sqlite3 \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

USER vscode