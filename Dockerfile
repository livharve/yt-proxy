FROM node:20-alpine
RUN apk add --no-cache curl python3 py3-pip ffmpeg && pip3 install --break-system-packages edge-tts pypinyin
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server.js polyphone.py ./
EXPOSE 3000
CMD ["sh", "-c", "yt-dlp -U 2>/dev/null || true && node server.js"]
