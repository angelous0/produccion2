FROM node:18-alpine AS build

WORKDIR /app

COPY package.json yarn.lock* ./
RUN npm install --legacy-peer-deps --force

# Vacío = URLs relativas (/api/...) que nginx proxea al backend internamente
# NO pasar REACT_APP_BACKEND_URL como build arg — debe quedar vacío siempre
ENV REACT_APP_BACKEND_URL=""

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
