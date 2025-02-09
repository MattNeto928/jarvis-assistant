from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
from smart_bulb import BulbManager  # Import your BulbManager class
import os  # Import the os module to access environment variables
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # React app URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize bulb manager with configurations from environment variables
BULB_CONFIGS = [
    {
        "device_id": os.environ.get("BULB_1_DEVICE_ID"),
        "ip_address": os.environ.get("BULB_1_IP_ADDRESS"),
        "local_key": os.environ.get("BULB_1_LOCAL_KEY"),
        "name": "Bulb 1"
    },
    {
        "device_id": os.environ.get("BULB_2_DEVICE_ID"),
        "ip_address": os.environ.get("BULB_2_IP_ADDRESS"),
        "local_key": os.environ.get("BULB_2_LOCAL_KEY"),
        "name": "Bulb 2"
    },
    {
        "device_id": os.environ.get("BULB_3_DEVICE_ID"),
        "ip_address": os.environ.get("BULB_3_IP_ADDRESS"),
        "local_key": os.environ.get("BULB_3_LOCAL_KEY"),
        "name": "Bulb 3"
    }
]

# Validate that all required environment variables are set.  Crucial to check before initialization!
for config in BULB_CONFIGS:
    if not all(config.values()):
        raise ValueError("Missing environment variables for bulb configuration.  Check that all BULB_* environment variables are set.")

manager = BulbManager()
for config in BULB_CONFIGS:
    manager.add_bulb(**config)

class ColorInput(BaseModel):
    h: int
    s: int
    v: int

class BulbAction(BaseModel):
    bulb_ids: List[str]

@app.get("/bulbs")
async def get_bulbs():
    """Get list of all bulbs and their configurations"""
    return BULB_CONFIGS

@app.get("/status")
async def get_status():
    """Get status of all bulbs"""
    status = await manager.get_all_status()  # Await the async function
    if not status:
        raise HTTPException(status_code=500, detail="Failed to get bulb status")
    return status

@app.post("/status/{bulb_id}")
async def get_bulb_status(bulb_id: str):
    """Get status of a specific bulb"""
    bulb = manager.get_bulb(bulb_id)
    if not bulb:
        raise HTTPException(status_code=404, detail="Bulb not found")
    status = await bulb.get_status()  # Await the async function
    if status is None:
        raise HTTPException(status_code=500, detail="Failed to get bulb status")
    return status

@app.post("/power/on")
async def turn_on_bulbs(data: BulbAction):
    """Turn on specified bulbs"""
    print(f"Received request to turn on bulbs: {data}")
    results = await manager.turn_on_bulbs(data.bulb_ids)  # Await the async function
    return results

@app.post("/power/off")
async def turn_off_bulbs(data: BulbAction):
    """Turn off specified bulbs"""
    print(f"Received request to turn off bulbs: {data}")
    results = await manager.turn_off_bulbs(data.bulb_ids)  # Await the async function
    return results

@app.post("/brightness/{value}")
async def set_brightness(value: int, data: BulbAction):
    """Set brightness for specified bulbs"""
    print(f"Received request to set brightness to {value} for bulbs: {data}")
    results = await manager.set_brightness_bulbs(data.bulb_ids, value) # Await the async function
    return results

@app.post("/temperature/{value}")
async def set_temperature(value: int, data: BulbAction):
    """Set color temperature for specified bulbs"""
    print(f"Received request to set temperature to {value} for bulbs: {data}")
    results = await manager.set_temperature_bulbs(data.bulb_ids, value)  # Await the async function
    return results

@app.post("/mode/{mode}")
async def set_mode(mode: str, data: BulbAction):
    """Set mode for specified bulbs"""
    print(f"Received request to set mode to {mode} for bulbs: {data}")
    results = await manager.set_mode_bulbs(data.bulb_ids, mode)  # Await the async function
    return results

@app.post("/color")
async def set_color(color: ColorInput, data: BulbAction):
    """Set color for specified bulbs"""
    print(f"Received request to set color {color} for bulbs: {data}")
    results = await manager.set_color_bulbs(data.bulb_ids, color.h, color.s, color.v)  # Await the async function
    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)