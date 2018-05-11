declare var module: any;
declare var global: any;

interface Game {
    cache: {
        structures: { [roomName: string]: { [structureType: string]: Structure[] } },
        hostiles: { [roomName: string]: Creep[] },
        hostilesAndLairs: { [roomName: string]: RoomObject[] }
        lairThreats: { [roomName: string]: StructureKeeperLair[] }
        fleeObjects: { [roomName: string]: RoomObject[] }
        mineralCount: { [mineralType: string]: number }
        labProcesses: { [resourceType: string]: number }
        activeLabCount: number;
        placedRoad: boolean;
    };
    operations: { [opName: string]: any };
}

interface Room {
    basicMatrix: CostMatrix;
    hostiles: Creep[];
    hostilesAndLairs: RoomObject[];
    fleeObjects: Array<Creep | Structure>;
    coords: RoomCoord;
    roomType: number;
    _defaultMatrix: CostMatrix;
    defaultMatrix: CostMatrix;
    structures: { [structureType: string]: Structure[] };
    memory: RoomMemory;

    findStructures<T>(structureType: string): T[];

    findStructures<T>(structureType: string): Structure[];

    getAltBattery(roomObject?: RoomObject): StructureContainer | Creep;
}

interface RoomMemory {
    owner: string;
    occupied: boolean;
    srcPos: string;
    level: number;
    nextTrade: number;
    nextScan: number;
    nextRadar: number;
    radarData: { x: number, y: number };
    spawnMemory: any;
    boostRequests: { [boostType: string]: { flagName: string, requesterIds: string[] } };
    controllerBatteryId: string;
    upgraderPositions: RoomPosition[];
}

interface RoomCoord {
    x: number;
    y: number;
    xDir: string;
    yDir: string;
}

interface RoomPosition {
    getFleeOptions(roomObject: RoomObject): RoomPosition[];

    bestFleePosition(roomObject: RoomObject): RoomPosition;

    openAdjacentSpots(ignoreCreeps?: boolean): RoomPosition[];

    getPositionAtDirection(direction: number, range?: number): RoomPosition;

    isPassable(ignoreCreeps?: boolean): boolean;

    lookForStructure(structureType: string): Structure;

    isNearExit(range: number): boolean;
}

interface RoomObject {
    findMemoStructure<T>(structureType: string, range: number, immediate?: boolean): T;
}

interface Creep {
    partCount(partType: string): number;

    blindMoveTo(destination: { pos: RoomPosition }, ops?: any, dareDevil?: boolean): number;
}

interface CreepMemory {
    boosts: string[];
    inPosition: boolean;
    scavanger: string;
}

interface Memory {
    // we can add any properties we intend to use here, instead of making Memory of type any
    temp: any;
    strangerDanger: { [username: string]: StrangerReport[] };
    stats: any;
    traders: { [username: string]: { [resourceType: string]: number; } };
    resourceOrder: { [time: number]: ResourceOrder };
    playerConfig: {
        terminalNetworkRange: number;
        enableStats: boolean;
        muteSpawn: boolean;
        creditReserveAmount: number;
        powerMinimum: number;
    };
    empire: any;
    profiler: { [identifier: string]: ProfilerData };
    notifier: Array<{
        time: number,
        earthTime: number,
        message: string,
    }>;
    roomAttacks: any;
    powerObservers: { [scanningRoomName: string]: { [roomName: string]: number } };
    cpu: {
        history: number[];
        average: number;
    };
    rooms: { [roomName: string]: RoomMemory };
    hostileMemory: { [id: string]: HostileMemory };
    nextGC: number;
    timeoutTracker: {
        operation: string;
        mission: string;
        phase: string;
    };
}

interface HostileMemory {
    potentials: { [partType: string]: number };
}

interface ProfilerData {
    startOfPeriod: number;
    lastTickTracked: number;
    total: number;
    count: number;
    costPerCall: number;
    costPerTick: number;
    callsPerTick: number;
    cpu: number;
    consoleReport: boolean;
    period: number;
}

interface ResourceOrder {
    resourceType: string;
    amountSent: number;
    roomName: string;
    amount: number;
    efficiency: number;
}

interface StrangerReport {
    tickSeen: number;
    roomName: string;
}

interface StructureController {
    getBattery(structureType?: string): StructureLink | StructureStorage | StructureContainer;

    getUpgraderPositions(): RoomPosition[];
}

interface StructureKeeperLair {
    keeper: Creep;
}

interface StructureObserver {
    observation: Observation;

    _observeRoom(roomName: string): number;

    observeRoom(roomName: string, purpose?: string, override?: boolean): number;
}

interface Observation {
    purpose: string;
    roomName: string;
    room?: Room;
}

interface StructureTerminal {
    _send(resourceType: string, amount: number, roomName: string, description?: string): number;

    send(resourceType: string, amount: number, roomName: string, description?: string): number;
}

interface StructureTower {
    alreadyFired: boolean;

    _repair(target: Structure | Spawn): number;
}
