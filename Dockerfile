# ===== Build stage =====
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable

# Copy dependency files trước
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build arguments (truyền API URL lúc build nếu cần)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build Vite
RUN pnpm build


# ===== Production stage =====
FROM nginx:alpine

# Xóa config mặc định
RUN rm /etc/nginx/conf.d/default.conf

# Copy build từ stage trước
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config của chúng ta
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]