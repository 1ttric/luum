# Introduction

Luum allows for the remote previewing, control, and configuration of one or more DSLR cameras over USB

Refer to the [libgphoto2](https://github.com/gphoto/libgphoto2) for a list of supported cameras

# Setup

Luum uses a client-server architecture. Likely you will be using a Raspberry Pi or similar small SBC to attach to the camera.

## Server

The API server is written in Python, using Flask and gunicorn for a WSGI

```bash
cd api
# Install dependencies
pip install -r requirements.txt
# Run
gunicorn -b 0.0.0.0:3001 app:app
```

## Client

The webserver is written in typed React, and served with Yarn

```bash
cd web
# Install dependencies
yarn
# Run
yarn start
```
