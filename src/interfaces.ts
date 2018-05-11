import {Empire} from "./ai/Empire";
import {Agent} from "./ai/missions/Agent";
import {Operation} from "./ai/operations/Operation";
import {SpawnGroup} from "./ai/SpawnGroup";

export interface bonzAI {
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
    operations: { [opName: string]: Operation };
    empire: Empire;
}

export interface TransportAnalysis {
    load: number;
    distance: number;
    cartsNeeded: number;
    carryCount: number;
    moveCount: number;
}

export interface IgorCommand {
    origin: string;
    destination: string;
    resourceType: string;
    amount?: number;
    reduceLoad?: boolean;
}

export interface LabProcess {
    targetShortage: Shortage;
    currentShortage: Shortage;
    reagentLoads: { [mineralType: string]: number };
    loadProgress: number;
}

export interface Shortage {
    mineralType: string;
    amount: number;
}

export interface PowerFlagScan {
    alleyRoomNames: string[];
    alleyIndex: number;
    flagIndex: number;
    matrices: { [roomName: string]: CostMatrix };
    avoidRooms: string[];
}

export interface HeadCountOptions {
    prespawn?: number;
    memory?: any;
    blindSpawn?: boolean;
    reservation?: SpawnReservation;
    disableNotify?: boolean;
    skipMoveToRoom?: boolean;
    boosts?: string[];
    allowUnboosted?: boolean;
    altSpawnGroup?: SpawnGroup;
}

export interface SpawnReservation {
    spawns: number;
    currentEnergy: number;
}

export interface BoostRequests {
    [resourceType: string]: {
        flagName: string;
        requesterIds: string[];
    };
}

export interface RaidData {
    raidAgents: Agent[];
    injuredCreeps: { [creepName: string]: number };
    breachFlags: Flag[];
    breachStructures: Structure[];
    attackRoom: Room;
    fallbackFlag: Flag;
    targetStructures: Structure[];
    fallback: boolean;
    obstacles: Array<{ pos: RoomPosition }>;
}

export interface RaidCache {
    breachPositions: RoomPosition[];
    breachStructures: string[];
    attackRoom: string;
    fallbackRoom: string;
    fallbackPos: RoomPosition;
    targetStructures: string[];
    matrix: number[];
    expectedDamage: number;
    avgWallHits: number;
    bestExit: RoomPosition;
}

export interface SquadConfig {
    type: string;
    boostLevel: BoostLevel;
}

export interface Coord {
    x: number;
    y: number;
}

export enum BoostLevel { Training, Unboosted, Boosted, SuperTough, RCL7 }

export interface SeedSelection {
    seedType: string;
    origin: Coord;
    rotation: number;
    energyPerDistance: number;
}

export interface SeedData {
    sourceData: Array<{ pos: RoomPosition, amount: number }>;
    seedScan: {
        [seedType: string]: Coord[],
    };
    seedSelectData: {
        index: number
        rotation: number
        best: SeedSelection,
    };
}

export interface BankData {
    pos: RoomPosition;
    hits: number;
    power: number;
    assisting?: boolean;
    finishing?: boolean;
    distance: number;
    timeout: number;
}

export interface FleeData {
    path: string;
    nextPos: RoomPosition;
    delay: number;
}
