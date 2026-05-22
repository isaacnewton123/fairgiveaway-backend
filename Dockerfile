FROM oven/bun:latest

# Chromium + headless Puppeteer system dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    xdg-utils \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Hugging Face Spaces run on port 7860
EXPOSE 7860

# The oven/bun image already has a user with UID 1000 (usually named 'bun').
# We can just use the numeric UID directly to satisfy HF Spaces.

# Set working directory and ownership
WORKDIR /app
RUN chown -R 1000:1000 /app

# Switch to non-root user
USER 1000

# Copy dependencies
COPY --chown=1000:1000 package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy application code
COPY --chown=1000:1000 . .

CMD ["bun", "run", "src/index.ts"]
