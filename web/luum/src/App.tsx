import React, {FC, useEffect, useRef, useState} from "react";
import "./App.css";
import {
    AppBar,
    Box,
    Container,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Toolbar,
    Typography
} from "@material-ui/core";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL ?? "http://127.0.0.1:3001"

interface CameraProps {
    port: string;
}

const Camera: FC<CameraProps> = props => {
    return <div
        style={{width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "stretch"}}>
        <div style={{
            flex: "3",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center"
        }}>
            <div style={{flex: "1"}}>Live view</div>
            <div style={{flex: "1", overflow: "hidden"}}>
                <div>
                    <img style={{maxWidth: "100%", maxHeight: "100%"}}
                         src={`${API_URL}/api/preview.mjpeg?port=${props.port}`}/>
                    <div style={{display: "flex", flexDirection: "column", width: "100%"}}></div>
                </div>
            </div>
        </div>
        <div style={{
            flex: "1",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center"
        }}>
            Settings
        </div>
    </div>
}

const App: FC = () => {
    const [cameras, setCameras] = useState<any[]>([])
    const [listIdx, setListIdx] = useState(0);
    const selectedPort = cameras[listIdx]?.port
    const appbarRef = useRef(null);

    useEffect(() => {
        const asyncEffect = async () => {
            const {data: cameras} = await axios.get(API_URL + "/api/cameras")
            setCameras(cameras)
        }
        asyncEffect().catch(console.error)
    }, [])

    return (
        <>
            <div ref={appbarRef}>
                <AppBar position="static">
                    <Toolbar>
                        <Typography variant="h6" style={{flex: "8"}}>
                            Luum
                        </Typography>
                        {
                            cameras.length ?
                                <FormControl style={{flex: "1"}}>
                                    <Select
                                        value={listIdx}
                                        onChange={e => {
                                            e?.target?.value && setListIdx(e.target.value as number)
                                        }}>
                                        {
                                            cameras.map((cam, idx) => <MenuItem key={idx} value={idx}>
                                                {cam.name} {cam.port}
                                            </MenuItem>)
                                        }
                                    </Select>
                                </FormControl> :
                                <em>No cameras detected</em>
                        }
                    </Toolbar>
                </AppBar>
            </div>
            <div style={{
                height: `calc(100vh - ${(appbarRef.current as any)?.offsetHeight ?? 0}px)`
            }}>
                {
                    selectedPort && <Camera port={selectedPort}/>
                }
            </div>
        </>
    );
}

export default App;
