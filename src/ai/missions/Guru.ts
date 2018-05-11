import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";

export abstract class Guru {

    protected flag: Flag;
    protected operation: Operation;
    protected memory: any;
    protected room: Room;
    protected spawnGroup: SpawnGroup;

    constructor(operation: Operation, name: string) {
        this.operation = operation;
        this.flag = operation.flag;
        this.room = operation.room;
        this.spawnGroup = operation.spawnGroup;
        if (!operation.memory[name]) { operation.memory[name] = {}; }
        this.memory = operation.memory[name];
    }

    public observeRoom(roomName: string): Room {
        const room = Game.rooms[roomName];
        if (room) return room;
        const observer = this.spawnGroup.room.findStructures<StructureObserver>(STRUCTURE_OBSERVER)[0];
        if (!observer) { return; }
        observer.observeRoom(this.flag.pos.roomName);
    }

    public static deserializePositions(stringified: string, roomName: string): RoomPosition[] {
        const roomPositions = [];
        if (!roomName) return;
        for (let i = 0; i < stringified.length; i += 4) {
            const x = parseInt(stringified.substr(i, 2), 10);
            const y = parseInt(stringified.substr(i + 2, 2), 10);
            roomPositions.push(new RoomPosition(x, y, roomName));
        }
        return roomPositions;
    }

    public static deserializePositionWithIndex(stringified: string, roomName: string, index: number): RoomPosition {
        const x = parseInt(stringified.substr(index, 2), 10);
        const y = parseInt(stringified.substr(index + 2, 2), 10);
        return new RoomPosition(x, y, roomName);
    }

    public static serializePositions(positions: RoomPosition[]): string {
        let stringified = "";
        for (const position of positions) {
            const x = position.x > 9 ? position.x.toString() : "0" + position.x;
            const y = position.y > 9 ? position.y.toString() : "0" + position.y;
            stringified += x + y;
        }
        return stringified;
    }
}
