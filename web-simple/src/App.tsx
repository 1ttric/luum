import React, {useEffect, useState} from "react";
import "./App.css";
import axios from "axios";
import {Box, CircularProgress, Paper, Typography} from "@material-ui/core";
import {sortBy} from "lodash";
import axiosRetry from "axios-retry";

axiosRetry(axios, {retries: 3})

const API_URL = process.env.REACT_APP_API_URL ?? ""

// Time before initial photo
const PHOTO_TIME_INITIAL = 5000
// Time before subsequent photos
const PHOTO_TIME_SUBSEQUENT = 3000
// Lag time to allow the camera to catch up
const PHOTO_POST_WAIT = 0
// How frequently to update the progress count, per second
const SPINNER_GRANULARITY = 10
// Total number of photos to take
const NUM_PHOTOS = 3

export interface Camera {
    name: string;
    port: string;
    summary: string;
}

export interface Folder {
    type: "folder"
    name: string
    children: (File | Folder)[]
}

export interface File {
    type: "file"
    name: string
    height: number
    mtime: number
    permissions: number
    size: number
    mimetype: string
    width: number
}


function App() {
    const [cameras, setCameras] = useState<Camera[]>()
    const [cameraFiles, setCameraFiles] = useState<Folder>()
    const [triggerFileUpdate, setTriggerFileUpdate] = useState(0)
    const [triggerPhoto, setTriggerPhoto] = useState(0)
    const [countdownProgress, setCountdownProgress] = useState(0)
    const [countdownTotal, setCountdownTotal] = useState(0)

    // Capture image
    const captureImage = async () => {
        if (!cameras?.[0]?.port) return;
        await axios.get(API_URL + "/api/capture/image", {params: {port: cameras[0].port}})
    }

    // Update camera files
    useEffect(() => {
        const asyncEffect = async () => {
            console.log("updating camera files")
            if (!cameras?.[0]?.port) return
            const {data} = await axios.get(API_URL + "/api/hierarchy", {params: {port: cameras[0].port}})
            setCameraFiles(data as Folder)
        }
        asyncEffect().catch(console.error)
    }, [triggerFileUpdate, cameras])

    // Get camera list
    useEffect(() => {
        const asyncEffect = async () => {
            const {data: cameras} = await axios.get(API_URL + "/api/cameras")
            setCameras(cameras as Camera[])
        }
        asyncEffect().catch(console.error)
    }, [])

    // Trigger camera photo run
    useEffect(() => {
        const asyncEffect = async () => {
            if (!triggerPhoto) return;

            setCountdownProgress(0)
            setCountdownTotal(PHOTO_TIME_INITIAL)
            for (let i = 0; i < SPINNER_GRANULARITY; i++) {
                await sleep(PHOTO_TIME_INITIAL / SPINNER_GRANULARITY)
                const progress = PHOTO_TIME_INITIAL * ((i + 1) / SPINNER_GRANULARITY)
                setCountdownProgress(progress)
            }
            await captureImage()
            await sleep(1000 + PHOTO_POST_WAIT)
            for (let i = 0; i < NUM_PHOTOS - 1; i++) {
                setCountdownProgress(0)
                setCountdownTotal(PHOTO_TIME_SUBSEQUENT)
                for (let i = 0; i < SPINNER_GRANULARITY; i++) {
                    await sleep(PHOTO_TIME_SUBSEQUENT / SPINNER_GRANULARITY)
                    const progress = PHOTO_TIME_SUBSEQUENT * ((i + 1) / SPINNER_GRANULARITY)
                    setCountdownProgress(progress)
                }
                await captureImage()
                await sleep(1000 + PHOTO_POST_WAIT)
            }
            setCountdownProgress(0)
            setCountdownTotal(0)
            await sleep(3000)
            setTriggerFileUpdate(i => i + 1)
        }
        asyncEffect().catch(console.error)
    }, [triggerPhoto])

    const recurseFiles = (obj: Folder | File, path: string): [path: string, file: File][] => {
        if (obj.type === "file" && obj.mimetype === "image/jpeg") {
            const file = obj as File
            return [[path, file]]
        } else if (obj.type === "folder") {
            const folder = obj as Folder;
            return folder.children.flatMap(c => recurseFiles(c, path + "/" + folder.name))
        }
        return []
    }
    const latestFiles: [path: string, file: File][] = (
        cameraFiles ?
            sortBy(cameraFiles.children.flatMap(c => recurseFiles(c, "")), "[1].mtime") :
            []
    ).reverse().slice(0, 3)
    console.log("rendering", cameraFiles, latestFiles)
    return (
        <Box sx={{
            width: "100vw",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
        }}>
            {
                !!cameras ?
                    cameras.length ? <>
                            <Box sx={{
                                flex: "3",
                                overflow: "hidden",
                                height: "100%",
                                width: "100%",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center"
                            }}>
                                {
                                    !!cameras[0]?.port &&
                                    <>
                                        <Box>
                                            {
                                                <img style={{height: "100%", width: "100%", objectFit: "cover"}}
                                                     src={`${API_URL}/api/preview.mjpeg?port=${cameras[0].port}&quality=20`}
                                                    // src="https://picsum.photos/600"
                                                     alt="Live preview"
                                                     onClick={() => setTriggerPhoto(i => i + 1)}/>
                                            }
                                        </Box>
                                        {
                                            !!countdownTotal &&
                                            <Box sx={{position: "absolute"}}>
                                                <Paper>
                                                    <Box sx={{p: 2}}>
                                                        <CircularProgress variant="indeterminate"
                                                                          size="10em"/>
                                                    </Box>
                                                    <Box
                                                        sx={{
                                                            top: 0,
                                                            left: 0,
                                                            bottom: 0,
                                                            right: 0,
                                                            position: "absolute",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                        }}
                                                    >
                                                        <Typography variant="h2">
                                                            {Math.max(0, Math.ceil((countdownTotal - ((countdownProgress / countdownTotal) * countdownTotal)) / 1000))}
                                                        </Typography>
                                                    </Box>
                                                </Paper>
                                            </Box>
                                        }
                                    </>

                                }
                            </Box>
                            <Box sx={{
                                overflow: "hidden",
                                flex: "1",
                                // m: 2,
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                justifyContent: "center"
                            }}>
                                {
                                    latestFiles.map(([path, f], idx) => (
                                        <Box style={{flex: "1"}} key={idx}>
                                            <img
                                                style={{height: "100%", width: "100%", objectFit: "contain"}}
                                                src={`${API_URL}/api/download/image?port=${cameras[0].port}&path=${path + "/" + f.name}&quality=20&size=300`}/>
                                        </Box>
                                    ))
                                }
                            </Box>
                        </> :
                        <Box sx={{flex: "1", display: "flex", alignItems: "center"}}>
                            <Typography variant="h1">
                                No cameras detected
                            </Typography>
                        </Box> :
                    <CircularProgress variant="indeterminate"
                                      size="10em"/>
            }
        </Box>
    );
}

export default App;

const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}