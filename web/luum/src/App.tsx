import React, {FC, ReactElement, useEffect, useRef, useState} from "react";

import axios, {AxiosResponse} from "axios";
import {
    AppBar,
    Box,
    Button,
    ButtonGroup,
    Checkbox,
    CircularProgress,
    Divider,
    Fab, Fade,
    IconButton,
    List,
    ListItem,
    MenuItem,
    Select, Slider,
    TextField,
    Toolbar,
    Typography
} from "@mui/material";
import AdapterDateFns from '@mui/lab/AdapterLuxon';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import {DateTimePicker} from "@mui/lab";
import {DateTime} from "luxon";
import {Star, StarBorder, Settings} from "@mui/icons-material";
import {useLocalStorage} from "usehooks-ts";
import {findIndex, sortBy} from "lodash";

const API_URL = process.env.REACT_APP_API_URL ?? ""

interface Camera {
    name: string;
    port: string;
    summary: string;
}

interface CameraLiveProps {
    camera: Camera;
}

const CameraLive: FC<CameraLiveProps> = props => {
    const [settingsShown, setSettingsShown] = useState(false);

    const [streamQuality, setStreamQuality] = useState<number | null>();

    return (
        <Box sx={{
            width: "100%",
            height: "100%",
            position: "relative"
        }}>
            <Box sx={{position: "absolute", zIndex: 20}} p={2}>
                <Fab size="small"
                     onClick={() => setSettingsShown(!settingsShown)}>
                    <Settings/>
                </Fab>
            </Box>
            <Fade in={settingsShown} style={{zIndex: 10}}>
                <Box sx={{
                    backgroundColor: "white",
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                }}>
                    <Box sx={{flex: "1"}}>
                        <Slider
                            value={streamQuality ?? 75}
                            min={1}
                            max={95}
                            onChange={(e: any) => setStreamQuality(e.target.value)}
                        />
                    </Box>
                    <Box sx={{flex: "1"}}>
                        <Typography>
                            Test
                        </Typography>
                    </Box>
                </Box>
            </Fade>
            <img alt=""
                 style={{width: "100%", height: "100%", objectFit: "contain", backgroundColor: "grey"}}
                 src={`${API_URL}/api/preview.mjpeg?port=${props.camera.port}&quality=${streamQuality ?? 0}`}/>
        </Box>
    )
}

interface CameraPaneProps {
    camera: Camera
}

const CameraPane: FC<CameraPaneProps> = props => {
    return <Box sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch"
    }}>
        <Box sx={{
            flex: "3",
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
        }}>
            <Box sx={{flex: "7", overflow: "hidden", alignSelf: "stretch"}}>
                <CameraLive camera={props.camera}/>
            </Box>
            <Box sx={{flex: "0"}} p={4}>
                <ButtonGroup variant="contained">
                    <Button onClick={async () => {
                        await axios.get(API_URL + "/api/capture/image", {params: {port: props.camera.port}})
                    }}>
                        Capture
                    </Button>
                </ButtonGroup>
            </Box>
        </Box>
        <Box sx={{flex: "1", overflowY: "scroll"}}>
            <SettingsList camera={props.camera}/>
        </Box>
    </Box>
}

interface Setting {
    changed: number
    id: number
    info: string
    label: string
    name: string
    path: string
    readonly: number
    type: number
    value: any
    choices?: string[]
}


interface SettingsListProps {
    camera: Camera;
}

const SettingsList: FC<SettingsListProps> = props => {
    const [loading, setLoading] = useState(true);
    const [triggerRefresh, setTriggerRefresh] = useState(0)
    const [settings, setSettings] = useState<Setting[]>([]);

    useEffect(() => {
        const asyncEffect = async () => {
            const {data: newSettings} = await axios.get(API_URL + "/api/settings", {params: {port: props.camera.port}})
            setSettings(newSettings)
            setLoading(false);
        }
        asyncEffect().catch(console.error)
    }, [props.camera, triggerRefresh])

    const renderSetting = (setting: Setting, onChange: (val: string | number) => void): ReactElement | null => {
        switch (setting.type) {
            case 0:
            case 1:
                return null;
            case 2:
                return <TextField
                    disabled={!!setting.readonly}
                    size="small"
                    fullWidth
                    multiline
                    maxRows={3}
                    defaultValue={setting.value}
                    onKeyPress={(e: any) => e.key === "Enter" && onChange(e.target.value)}
                />
            case 3:
                return <Typography>TODO: Implement slider</Typography>
            case 4:
                return <Checkbox
                    disabled={!!setting.readonly}
                    checked={!!setting.value}
                    onChange={(e, checked) => onChange(checked ? 1 : 0)}/>
            case 5:
            case 6:
                return <Select
                    disabled={!!setting.readonly}
                    value={setting.value}
                    onChange={e => onChange(e.target.value)}>
                    {
                        setting.choices?.map((choice, idx) => <MenuItem key={idx} value={choice}>{choice}</MenuItem>)
                    }
                </Select>
            case 7:
                return <Typography>TODO: Implement button</Typography>
            case 8:
                return <DateTimePicker
                    disabled={!!setting.readonly}
                    renderInput={(props) => <TextField {...props} />}
                    onChange={val => val && onChange(val.toSeconds())}
                    value={DateTime.fromSeconds(setting.value)}/>
            default:
                return null;
        }
    }

    const [favorites, setFavorites] = useLocalStorage<string[]>(props.camera.name, []);

    return loading ?
        <Box sx={{width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center"}}>
            <Box sx={{flex: "0"}}>
                <CircularProgress/>
            </Box>
        </Box> :
        <List>
            {
                sortBy(settings, [
                    setting => -favorites.indexOf(setting.path),
                    setting => findIndex(settings, {id: setting.id}),
                ]).map((setting, idx) => {
                        const isFavorite = favorites.includes(setting.path);
                        return (
                            <>
                                <ListItem key={idx + "0"}>
                                    <Box sx={{width: "100%", height: "100%", display: "flex", alignItems: "center"}}>
                                        <Box sx={{flex: "0"}} pr={2}>
                                            <IconButton onClick={() => {
                                                if (isFavorite) {
                                                    setFavorites(favorites.filter(s => s !== setting.path))
                                                } else {
                                                    setFavorites([...favorites, setting.path])
                                                }
                                            }}>
                                                {
                                                    isFavorite ? <Star/> : <StarBorder/>
                                                }
                                            </IconButton>
                                        </Box>
                                        <Box sx={{
                                            flex: "1",
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "stretch"
                                        }}>
                                            <Typography sx={{flex: "1"}} variant="subtitle1">
                                                {
                                                    setting.label + (setting.readonly ? " (readonly)" : "")
                                                }
                                            </Typography>
                                            <Typography sx={{flex: "1"}} variant="subtitle2">
                                                {
                                                    setting.path
                                                }
                                            </Typography>
                                            <Box sx={{flex: "1", alignSelf: "end"}}>
                                                {
                                                    renderSetting(setting, async newVal => {
                                                        if (setting.readonly) return;
                                                        console.log(`updating ${setting.path} to`, newVal)
                                                        setLoading(true);
                                                        try {
                                                            await axios.put(API_URL + "/api/setting", {
                                                                port: props.camera.port,
                                                                setting: {...setting, ...{value: newVal}}
                                                            })
                                                        } catch (e) {
                                                            const resp = (e as any).response as AxiosResponse;
                                                            if (resp.status !== 500) {
                                                                throw e;
                                                            }
                                                        }
                                                        setTriggerRefresh(i => i + 1)
                                                    })
                                                }
                                            </Box>
                                        </Box>
                                    </Box>
                                </ListItem>
                                {
                                    idx < settings.length - 1 && <Divider key={idx + "1"}/>
                                }
                            </>
                        )
                    }
                )
            }
        </List>
}

const App: FC = () => {
    const [cameras, setCameras] = useState<Camera[]>([])
    const [listIdx, setListIdx] = useState(0);
    const selectedCamera = cameras[listIdx]
    const appbarRef = useRef(null);

    useEffect(() => {
        const asyncEffect = async () => {
            const {data: cameras} = await axios.get(API_URL + "/api/cameras")
            setCameras(cameras)
        }
        asyncEffect().catch(console.error)
    }, [])

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box ref={appbarRef}>
                <AppBar position="static">
                    <Toolbar>
                        <Typography variant="h6" style={{flex: "8"}}>
                            Luum
                        </Typography>
                        {
                            cameras.length ?
                                <Select
                                    sx={{width: "12em"}}
                                    value={listIdx}
                                    onChange={e => {
                                        e?.target?.value && setListIdx(e.target.value as number)
                                    }}>
                                    {
                                        cameras.map((cam, idx) => <MenuItem key={idx} value={idx}>
                                            {cam.name} {cam.port}
                                        </MenuItem>)
                                    }
                                </Select> :
                                <em>No cameras detected</em>
                        }
                    </Toolbar>
                </AppBar>
            </Box>
            <Box sx={{
                height: `calc(100vh - ${(appbarRef.current as any)?.offsetHeight ?? 0}px)`
            }}>
                {
                    selectedCamera && <CameraPane camera={selectedCamera}/>
                }
            </Box>
        </LocalizationProvider>
    );
}

export default App;
