import asyncio
from typing import Dict, List, Optional
import tinytuya

class Bulb:
    def __init__(self, device_id: str, ip_address: str, local_key: str, name: str):
        self.device_id = device_id
        self.ip_address = ip_address
        self.local_key = local_key
        self.name = name
        self.device = tinytuya.BulbDevice(device_id, ip_address, local_key)  # Changed to BulbDevice
        self.device.set_version(3.5)  # Or 3.1, depending on your device

        # Define the DPS values based on your specific bulb model (use tinytuya-cloud to verify!)
        self.power_dps = '20' #boolean
        self.brightness_dps = '23' #int
        self.color_temp_dps = '22' #int
        self.color_mode_dps = '21' #string
        self.color_hsv_dps = '24' #String

        self.status_cache = None

    async def _refresh_status(self):
        """Refreshes the bulb status using tinytuya."""
        try:
            data =  self.device.status()  # Call status() directly (synchronously)
            print(f"Raw status data for bulb {self.device_id}: {data}")

            if data and isinstance(data, dict) and 'dps' in data and isinstance(data['dps'], dict):
                self.status_cache = data['dps']
                print(f"Updated status for bulb {self.device_id}: {self.status_cache}")
            else:
                print(f"Failed to get status for bulb {self.device_id}: {data}")
                self.status_cache = None
        except Exception as e:
            print(f"Error refreshing status for bulb {self.device_id}: {e}")
            self.status_cache = None

    async def get_status(self) -> Optional[Dict]:
        """Gets the cached status of the bulb, refreshing if necessary."""
        if self.status_cache is None:
            await self._refresh_status()
        return self.status_cache

    async def turn_on(self) -> bool:
        """Turns the bulb on."""
        try:
            self.device.turn_on() #This only works with switches! You must now use self.device.set_value
            await self._refresh_status()
            return True
        except Exception as e:
            print(f"Error turning on bulb {self.device_id}: {e}")
            return False

    async def turn_off(self) -> bool:
        """Turns the bulb off."""
        try:
           self.device.turn_off() #This only works with switches! You must now use self.device.set_value
           await self._refresh_status()
           return True
        except Exception as e:
            print(f"Error turning off bulb {self.device_id}: {e}")
            return False



    async def set_brightness(self, brightness: int) -> bool:
        """Sets the brightness of the bulb."""
        try:
            self.device.set_value(self.brightness_dps, brightness) #Removed Await
            await self._refresh_status()
            return True
        except Exception as e:
            print(f"Error setting brightness for bulb {self.device_id}: {e}")
            return False

    async def set_temperature(self, temperature: int) -> bool:
        """Sets the color temperature of the bulb."""
        try:
            self.device.set_value(self.color_temp_dps, temperature) #Removed Await
            await self._refresh_status()
            return True
        except Exception as e:
            print(f"Error setting color temperature for bulb {self.device_id}: {e}")
            return False

    async def set_color(self, h: int, s: int, v: int) -> bool:
        """Sets the color of the bulb using HSV values."""
        try:
            #You will need to figure out how to convert HSV to the proper hex code for dps 24.  This is a sample only.
            color_hex = self.hsv_to_hex(h,s,v) #Replace this with proper method call, may now be implented!
            self.device.set_value(self.color_hsv_dps, color_hex) #Removed Await
            await self._refresh_status()
            return True
        except Exception as e:
            print(f"Error setting color for bulb {self.device_id}: {e}")
            return False

    def hsv_to_hex(self, h, s, v):
        """
        Converts HSV color values to a hexadecimal color code.
        """
        # Code here for HSV to hex conversion
        # You might need to find or implement a suitable conversion function
        return "000000000000"  # Placeholder, REPLACE with actual hex conversion!


class BulbManager:
    def __init__(self):
        self.bulbs: Dict[str, Bulb] = {}
        self.lock = asyncio.Lock()

    def add_bulb(self, device_id: str, ip_address: str, local_key: str, name: str):
        self.bulbs[device_id] = Bulb(device_id, ip_address, local_key, name)

    def get_bulb(self, device_id: str) -> Optional[Bulb]:
        return self.bulbs.get(device_id)

    async def get_all_status(self) -> Dict[str, Optional[Dict]]:
        """Gets the status of all bulbs concurrently."""
        async with self.lock:
            results = {}
            tasks = [bulb.get_status() for bulb in self.bulbs.values()]
            statuses = await asyncio.gather(*tasks)
            for i, bulb_id in enumerate(self.bulbs.keys()):
                results[bulb_id] = statuses[i]
            return results

    async def turn_on_bulbs(self, bulb_ids: List[str]) -> Dict[str, bool]:
        """Turns on specified bulbs."""
        return await self._run_bulb_action(bulb_ids, "turn_on")

    async def turn_off_bulbs(self, bulb_ids: List[str]) -> Dict[str, bool]:
        """Turns off specified bulbs."""
        return await self._run_bulb_action(bulb_ids, "turn_off")

    async def set_brightness_bulbs(self, bulb_ids: List[str], value: int) -> Dict[str, bool]:
        """Sets brightness for specified bulbs."""
        return await self._run_bulb_action(bulb_ids, "set_brightness", brightness=value)

    async def set_temperature_bulbs(self, bulb_ids: List[str], value: int) -> Dict[str, bool]:
        """Sets color temperature for specified bulbs."""
        return await self._run_bulb_action(bulb_ids, "set_temperature", temperature=value)

    async def set_color_bulbs(self, bulb_ids: List[str], h: int, s: int, v: int) -> Dict[str, bool]:
        """Sets color for specified bulbs."""
        return await self._run_bulb_action(bulb_ids, "set_color", h=h, s=s, v=v)

    async def _run_bulb_action(self, bulb_ids: List[str], action: str, **kwargs) -> Dict[str, bool]:
        """Helper function to run actions on multiple bulbs."""
        results = {}
        for bulb_id in bulb_ids:
            bulb = self.get_bulb(bulb_id)
            if bulb:
                try:
                    method = getattr(bulb, action)
                    if method and asyncio.iscoroutinefunction(method): #Check if it is async
                        results[bulb_id] = await method(**kwargs)
                    else:
                        print(f"Method {action} for bulb {bulb_id} is not asynchronous")
                        results[bulb_id] = False
                except Exception as e:
                    print(f"Error running action {action} on bulb {bulb_id}: {e}")
                    results[bulb_id] = False
            else:
                results[bulb_id] = False
        return results