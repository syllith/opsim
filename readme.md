This is a React project. It uses Vite, which is like a hot-reloadable temporary web server that you'll use in development. Configure Vite via "vite.config.js" file.

You can use "npm run dev" in order to start it. This only starts up the front-end. In order to start the backend server, you can open a different console window and type "node server.js"

This will start the Express server. Any changes to "server.js" will result in the express server needing to be restarted. Changes made on the front end however are updated instantly in real time, no need to reload.

The main starting point of the application is App.jsx. This defines the routes you have available, such as /home, /login, /register, etc. Routes don't HAVE to be defined here, but its a sensible place. The react-router package is responsible for displaying the correct component based on the route the user has entered in their browser. 

For a login system, this is what AuthContext.jsx is used for. This can be thought of as a middleman component, responsible for connecting to the express servers backend and connecting to /api/checkLoginStatus. This will verify if the browser is currently logged in or not. If not, it returns a 401 error, but if logged in, it will return 200 along with any data tied to that specific users account (such as preferences, permissions, roles, anything you want). This component gets passed to any other component that might utilize this data and you can read from it whenever you'd like. 

The login system uses mongo-sessions in order to track login sessions. This means you'll need mongodb installed and the .env file will need updated to point to the correct Mongo database. You can specify how long you want a user to stay logged in for in "server.js".

To install new packages, you can use "npm i". If no package is specified, it will install whatever is in package.json. If you say something like "npm i axios", this will download, install, and add the axios package to your project/package.json file.

To view outdated packages, use the "npm outdated" command.

To build a production ready project, use the "npm run build" command. This will create a "dist" folder with all your project files in there. Simply point Nginx to that directory and it will be publicly hosted, but this is just the frontend. 

Use something like PM2 to host the backend server. Be sure that the Nginx /api proxy port matches what your port in server.js. When making network requests to an API you've created in server.js, you must call them like this: /api/myOwnAPI. Attempting to use the full url such as "https://rivalytics.com/api/myOwnAPI" will result in CORs errors, as the browser will think you're cross site scripting, since in development mode you're accessing the site via localhost, while it's trying to make calls to a REMOTE address. Using /api/whatever by itself allows it to work in both production and development builds.

Example Nginx config:
# Rivalytics
server {
    listen 443 ssl;
    server_name rivalytics.digi-safe.co;
    root /hdd/webroot/rivalytics/dist;
    index index.html;
    
    # Proxy API requests to the express backend
    location /api {
        proxy_pass http://localhost:5581; #This port needs to match what you have set in server.js
        proxy_set_header Host $http_host;

        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
    }
    # Serve static files and handle routing for the React app
    location / {
        try_files $uri $uri/ /index.html;
    }
    ssl_certificate /etc/letsencrypt/live/rivalytics.digi-safe.co/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rivalytics.digi-safe.co/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}