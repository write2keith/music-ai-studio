import asyncio
import json
from typing import Optional


class ConnectionManager:
    def __init__(self):
        self.clients: list = []
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket) -> None:
        await websocket.accept()
        self.clients.append(websocket)

    def disconnect(self, websocket) -> None:
        if websocket in self.clients:
            self.clients.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        text = json.dumps(message)
        dead = []
        for client in self.clients:
            try:
                await client.send_text(text)
            except Exception:
                dead.append(client)
        for c in dead:
            self.disconnect(c)

    def broadcast_threadsafe(self, message: dict) -> None:
        if self._loop is None:
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(message), self._loop)


manager = ConnectionManager()
