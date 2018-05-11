import {IGOR_CAPACITY, PRODUCTION_AMOUNT, REAGENT_LIST} from "../../config/constants";
import {helper} from "../../helpers/helper";
import {BoostRequests, IgorCommand, LabProcess, Shortage} from "../../interfaces";
import {Operation} from "../operations/Operation";
import {MINERALS_RAW, POWER_PROCESS_THRESHOLD, PRODUCT_LIST, RESERVE_AMOUNT} from "../TradeNetwork";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class IgorMission extends Mission {

    public igors: Agent[];
    public labs: StructureLab[];
    public reagentLabs: StructureLab[];
    public productLabs: StructureLab[];
    public labProcess: LabProcess;
    public terminal: StructureTerminal;
    public storage: StructureStorage;
    public powerSpawn: PowerSpawn;
    public memory: {
        idlePosition: RoomPosition;
        command: IgorCommand;
        labCount: number;
        reagentLabIds: string[];
        productLabIds: string[];
        lastCommandTick: number;
        checkProcessTick: number;
        labProcess: LabProcess;
    };

    constructor(operation: Operation) {
        super(operation, "igor");
    }

    public initMission() {
        this.labs = this.room.findStructures(STRUCTURE_LAB) as StructureLab[];
        this.terminal = this.room.terminal;
        this.storage = this.room.storage;

        this.reagentLabs = this.findReagentLabs();
        this.productLabs = this.findProductLabs();

        this.labProcess = this.findLabProcess();
        if (this.labProcess) {
            const target = this.labProcess.targetShortage.mineralType;
            if (!Game.cache.labProcesses[target]) Game.cache.labProcesses[target] = 0;
            Game.cache.labProcesses[target]++;
        }

        this.powerSpawn = this.room.findStructures(STRUCTURE_POWER_SPAWN)[0] as PowerSpawn;

        this.findIgorIdlePosition();
    }

    public roleCall() {
        this.igors = this.headCount("igor", () => this.workerBody(0, 20, 10), () => 1, {
            prespawn: 50,
            memory: {idlePosition: this.memory.idlePosition},
        });
        if (this.igors.length === 0) {
            this.memory.command = undefined;
        }
    }

    public missionActions() {

        for (let i = 0; i < this.igors.length; i++) {
            const igor = this.igors[i];
            this.igorActions(igor, i);
        }

        if (this.labProcess) {
            this.doSynthesis();
        }

        if (this.powerSpawn && this.powerSpawn.energy > 50 && this.powerSpawn.power > 0
            && this.storage.store.energy > POWER_PROCESS_THRESHOLD) {
            this.powerSpawn.processPower();
        }

        this.checkBoostRequests();
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
        if (!this.memory.labCount) this.memory.labCount = this.labs.length;
        if (this.memory.labCount !== this.labs.length) {
            this.memory.labCount = this.labs.length;
            this.memory.reagentLabIds = undefined;
            this.memory.productLabIds = undefined;
        }

        if (this.memory.idlePosition) {
            const position = helper.deserializeRoomPosition(this.memory.idlePosition);
            if (position.lookFor(LOOK_STRUCTURES).length > 0) {
                this.memory.idlePosition = undefined;
            }
        }
    }

    private igorActions(igor: Agent, order: number) {

        if (order > 0) {
            igor.idleOffRoad();
            return;
        }

        const command = this.accessCommand(igor);
        if (!command) {
            if (_.sum(igor.carry) > 0) {
                console.log("igor in", this.operation.name, "is holding resources without a command, putting them in terminal");
                if (igor.pos.isNearTo(this.terminal)) {
                    igor.transferEverything(this.terminal);
                }
                else {
                    igor.travelTo(this.terminal);
                }
                return;
            }
            if (this.memory.idlePosition) {
                igor.moveItOrLoseIt(helper.deserializeRoomPosition(this.memory.idlePosition));
            }
            else {
                igor.idleOffRoad(this.room.controller);
            }
            return;
        }

        if (_.sum(igor.carry) === 0) {
            const origin = Game.getObjectById<Structure>(command.origin);
            if (igor.pos.isNearTo(origin)) {
                if (origin instanceof StructureTerminal) {
                    if (!origin.store[command.resourceType]) {
                        console.log(`IGOR: I can't find that resource in terminal, opName: ${this.operation.name}`);
                        this.memory.command = undefined;
                    }
                }
                igor.withdraw(origin, command.resourceType, command.amount);
                const _destination = Game.getObjectById<Structure>(command.destination);
                if (!igor.pos.isNearTo(_destination)) {
                    igor.travelTo(_destination);
                }
            }
            else {
                igor.travelTo(origin);
            }
            return; // early
        }

        const destination = Game.getObjectById<Structure>(command.destination);
        if (igor.pos.isNearTo(destination)) {
            const outcome = igor.transfer(destination, command.resourceType, command.amount);
            if (outcome === OK && command.reduceLoad && this.labProcess) {
                this.labProcess.reagentLoads[command.resourceType] -= command.amount;
            }
            this.memory.command = undefined;
        }
        else {
            igor.travelTo(destination);
        }
    }

    private findCommand(): IgorCommand {

        const terminal = this.room.terminal;
        const storage = this.room.storage;
        const energyInStorage = storage.store.energy;
        const energyInTerminal = terminal.store.energy;

        let command = this.checkPullFlags();
        if (command) return command;

        command = this.checkReagentLabs();
        if (command) return command;

        command = this.checkProductLabs();
        if (command) return command;

        // take energy out of terminal
        if (energyInTerminal > 30000 + IGOR_CAPACITY) {
            return {origin: terminal.id, destination: storage.id, resourceType: RESOURCE_ENERGY};
        }

        // load terminal
        if (energyInStorage > 50000 && energyInTerminal < 30000) {
            return {origin: storage.id, destination: terminal.id, resourceType: RESOURCE_ENERGY};
        }

        // TODO: make individual check-functions for each of these commands like i've done with labs

        // load powerSpawn
        const powerSpawn = this.room.findStructures(STRUCTURE_POWER_SPAWN)[0] as StructurePowerSpawn;
        if (powerSpawn) {
            // load energy
            if (powerSpawn.energy < powerSpawn.energyCapacity - IGOR_CAPACITY) {
                return {origin: storage.id, destination: powerSpawn.id, resourceType: RESOURCE_ENERGY};
            }
            // load power
            else if (powerSpawn.power === 0 && terminal.store[RESOURCE_POWER] >= 100) {
                return {origin: terminal.id, destination: powerSpawn.id, resourceType: RESOURCE_POWER, amount: 100};
            }
        }

        // push local minerals
        for (const mineralType in storage.store) {
            if (mineralType !== RESOURCE_ENERGY) {
                if (!terminal.store[mineralType] || terminal.store[mineralType] < RESERVE_AMOUNT * 2) {
                    return {origin: storage.id, destination: terminal.id, resourceType: mineralType};
                }
            }
        }

        // load nukers
        const nuker = this.room.findStructures(STRUCTURE_NUKER)[0] as StructureNuker;
        if (nuker) {
            if (nuker.energy < nuker.energyCapacity && storage.store.energy > 100000) {
                return {origin: storage.id, destination: nuker.id, resourceType: RESOURCE_ENERGY};
            }
            else if (nuker.ghodium < nuker.ghodiumCapacity && terminal.store[RESOURCE_GHODIUM]) {
                return {origin: terminal.id, destination: nuker.id, resourceType: RESOURCE_GHODIUM};
            }
        }
    }

    private accessCommand(igor: Agent): IgorCommand {
        if (!this.memory.command && igor.ticksToLive < 40) {
            igor.suicide();
            return;
        }

        if (!this.memory.lastCommandTick) this.memory.lastCommandTick = Game.time - 10;
        if (!this.memory.command && Game.time > this.memory.lastCommandTick + 10) {
            if (_.sum(igor.carry) === 0) {
                this.memory.command = this.findCommand();
            }
            else {
                console.log("IGOR: can't take new command in:", this.operation.name, "because I'm holding something");
            }
            if (!this.memory.command) {
                this.memory.lastCommandTick = Game.time;
            }
        }
        return this.memory.command;
    }

    private checkPullFlags(): IgorCommand {
        if (!this.productLabs) return;
        for (const lab of this.productLabs) {
            if (this.terminal.store.energy >= IGOR_CAPACITY && lab.energy < IGOR_CAPACITY) {
                // restore boosting energy to lab
                return {origin: this.terminal.id, destination: lab.id, resourceType: RESOURCE_ENERGY};
            }

            const flag = lab.pos.lookFor<Flag>(LOOK_FLAGS)[0];
            if (!flag) continue;

            const mineralType = flag.name.substring(flag.name.indexOf("_") + 1);
            if (!_.includes(PRODUCT_LIST, mineralType)) {
                console.log("ERROR: invalid lab request:", flag.name);
                return; // early
            }
            if (lab.mineralType && lab.mineralType !== mineralType) {
                // empty wrong mineral type
                return {origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType};
            }
            else if (LAB_MINERAL_CAPACITY - lab.mineralAmount >= IGOR_CAPACITY && this.terminal.store[mineralType] >= IGOR_CAPACITY) {
                // bring mineral to lab when amount is below igor capacity
                return {origin: this.terminal.id, destination: lab.id, resourceType: mineralType};
            }
        }
    }

    private checkReagentLabs(): IgorCommand {
        if (!this.reagentLabs || this.reagentLabs.length < 2) return; // early

        for (let i = 0; i < 2; i++) {
            const lab = this.reagentLabs[i];
            const mineralType = this.labProcess ? Object.keys(this.labProcess.reagentLoads)[i] : undefined;
            if (!mineralType && lab.mineralAmount > 0) {
                // clear labs when there is no current process
                return {origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType};
            }
            else if (mineralType && lab.mineralType && lab.mineralType !== mineralType) {
                // clear labs when there is mismatch with current process
                return {origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType};
            }
            else if (mineralType) {
                const amountNeeded = Math.min(this.labProcess.reagentLoads[mineralType], IGOR_CAPACITY);
                if (amountNeeded > 0 && this.terminal.store[mineralType] >= amountNeeded
                    && lab.mineralAmount <= LAB_MINERAL_CAPACITY - IGOR_CAPACITY) {
                    // bring mineral to lab when amount drops below amountNeeded
                    return {
                        origin: this.terminal.id,
                        destination: lab.id,
                        resourceType: mineralType,
                        amount: amountNeeded,
                        reduceLoad: true,
                    };
                }
            }
        }
    }

    private checkProductLabs(): IgorCommand {
        if (!this.productLabs) return; // early

        for (const lab of this.productLabs) {

            if (this.terminal.store.energy >= IGOR_CAPACITY && lab.energy < IGOR_CAPACITY) {
                // restore boosting energy to lab
                return {origin: this.terminal.id, destination: lab.id, resourceType: RESOURCE_ENERGY};
            }

            const flag = lab.pos.lookFor<Flag>(LOOK_FLAGS)[0];
            if (flag) continue;

            if (lab.mineralAmount > 0 && (!this.labProcess || lab.mineralType !== this.labProcess.currentShortage.mineralType)) {
                // empty wrong mineral type or clear lab when no process
                return {origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType};
            }
            else if (this.labProcess && lab.mineralAmount >= IGOR_CAPACITY) {
                // store product in terminal
                return {origin: lab.id, destination: this.terminal.id, resourceType: lab.mineralType};
            }
        }
    }

    private findReagentLabs(): StructureLab[] {
        if (this.memory.reagentLabIds) {
            const _labs = _.map(this.memory.reagentLabIds, (id: string) => {
                const lab = Game.getObjectById(id);
                if (lab) {
                    return lab;
                }
                else {
                    this.memory.reagentLabIds = undefined;
                }
            }) as StructureLab[];
            if (_labs.length === 2) {
                return _labs;
            }
            else {
                this.memory.reagentLabIds = undefined;
            }
        }

        if (Game.time % 1000 !== 2) return; // early

        const labs = this.room.findStructures(STRUCTURE_LAB) as StructureLab[];
        if (labs.length < 3) return; // early

        const reagentLabs = [];
        for (const lab of labs) {
            if (reagentLabs.length === 2) break;
            let outOfRange = false;
            for (const otherLab of labs) {
                if (lab.pos.inRangeTo(otherLab, 2)) continue;
                outOfRange = true;
                break;
            }
            if (!outOfRange) reagentLabs.push(lab);
        }

        if (reagentLabs.length === 2) {
            this.memory.reagentLabIds = _.map(reagentLabs, (lab: StructureLab) => lab.id);
            this.memory.productLabIds = undefined;
            return reagentLabs;
        }
    }

    private findProductLabs(): StructureLab[] {
        if (this.memory.productLabIds) {
            const _labs = _.map(this.memory.productLabIds, (id: string) => {
                const lab = Game.getObjectById(id);
                if (lab) {
                    return lab;
                }
                else {
                    this.memory.productLabIds = undefined;
                }
            }) as StructureLab[];
            if (_labs.length > 0) {
                return _labs;
            }
            else {
                this.memory.productLabIds = undefined;
            }
        }

        let labs = this.room.findStructures(STRUCTURE_LAB) as StructureLab[];
        if (labs.length === 0) return; // early

        if (this.reagentLabs) {
            for (const reagentLab of this.reagentLabs) {
                labs = _.pull(labs, reagentLab);
            }
        }

        this.memory.productLabIds = _.map(labs, (lab: StructureLab) => lab.id);
        return labs;
    }

    private doSynthesis() {
        for (let i = 0; i < this.productLabs.length; i++) {
            // so that they don't all activate on the same tick and make bucket sad
            if (Game.time % 10 !== i) continue;
            const lab = this.productLabs[i];
            if (lab.pos.lookFor(LOOK_FLAGS).length > 0) continue;
            if (!lab.mineralType || lab.mineralType === this.labProcess.currentShortage.mineralType) {
                const outcome = lab.runReaction(this.reagentLabs[0], this.reagentLabs[1]);
                if (outcome === OK) {
                    Game.cache.activeLabCount++;
                }
            }
        }
    }

    private findLabProcess(): LabProcess {
        if (!this.reagentLabs) return;

        if (this.memory.labProcess) {
            const process = this.memory.labProcess;
            const processFinished = this.checkProcessFinished(process);
            if (processFinished) {
                console.log("IGOR:", this.operation.name, "has finished with", process.currentShortage.mineralType);
                this.memory.labProcess = undefined;
                return this.findLabProcess();
            }
            const progress = this.checkProgress(process);
            if (!progress) {
                console.log("IGOR:", this.operation.name, "made no progress with", process.currentShortage.mineralType);
                this.memory.labProcess = undefined;
                return this.findLabProcess();
            }
            return process;
        }

        // avoid checking for new process every tick
        if (!this.memory.checkProcessTick) this.memory.checkProcessTick = Game.time - 100;
        if (Game.time < this.memory.checkProcessTick + 100) return; // early

        this.memory.labProcess = this.findNewProcess();
    }

    private checkProcessFinished(process: LabProcess) {

        for (let i = 0; i < 2; i++) {
            const amountInLab = this.reagentLabs[i].mineralAmount;
            const load = process.reagentLoads[Object.keys(process.reagentLoads)[i]];
            if (amountInLab === 0 && load === 0) {
                return true;
            }
        }

        return false;
    }

    private checkProgress(process: LabProcess) {
        if (Game.time % 1000 !== 2) return true;
        let loadStatus = 0;
        for (const resourceType in process.reagentLoads) {
            loadStatus += process.reagentLoads[resourceType];
        }
        if (loadStatus !== process.loadProgress) {
            process.loadProgress = loadStatus;
            return true;
        }
        else {
            return false;
        }
    }

    private findNewProcess(): LabProcess {

        const store = this.gatherInventory();

        for (const compound of PRODUCT_LIST) {
            if (store[compound] >= PRODUCTION_AMOUNT) continue;
            return this.generateProcess({
                mineralType: compound,
                amount: PRODUCTION_AMOUNT + IGOR_CAPACITY - (this.terminal.store[compound] || 0),
            });
        }

        if (store[RESOURCE_CATALYZED_GHODIUM_ACID] < PRODUCTION_AMOUNT + 5000) {
            return this.generateProcess({mineralType: RESOURCE_CATALYZED_GHODIUM_ACID, amount: 5000});
        }
    }

    private recursiveShortageCheck(shortage: Shortage, fullAmount = false): Shortage {

        // gather amounts of compounds in terminal and labs
        const store = this.gatherInventory();
        if (store[shortage.mineralType] === undefined) store[shortage.mineralType] = 0;
        let amountNeeded = shortage.amount - Math.floor(store[shortage.mineralType] / 10) * 10;
        if (fullAmount) {
            amountNeeded = shortage.amount;
        }
        if (amountNeeded > 0) {
            // remove raw minerals from list, no need to make those
            const reagents = _.filter(REAGENT_LIST[shortage.mineralType], (mineralType: string) => !_.includes(MINERALS_RAW, mineralType));
            let shortageFound;
            for (const reagent of reagents) {
                shortageFound = this.recursiveShortageCheck({mineralType: reagent, amount: amountNeeded});
                if (shortageFound) break;
            }
            if (shortageFound) {
                return shortageFound;
            }
            else {
                return {mineralType: shortage.mineralType, amount: amountNeeded};
            }
        }
    }

    private gatherInventory(): { [key: string]: number } {
        const inventory: { [key: string]: number } = {};
        for (const mineralType in this.terminal.store) {
            if (!this.terminal.store.hasOwnProperty(mineralType)) continue;
            if (inventory[mineralType] === undefined) inventory[mineralType] = 0;
            inventory[mineralType] += this.terminal.store[mineralType];
        }
        for (const lab of this.productLabs) {
            if (lab.mineralAmount > 0) {
                if (inventory[lab.mineralType] === undefined) inventory[lab.mineralType] = 0;
                inventory[lab.mineralType] += lab.mineralAmount;
            }
        }
        /* shouldn't need to check igors
        for (let igor of this.igors) {
            for (let resourceType in igor.carry) {
                inventory[resourceType] += igor.carry[resourceType];
            }
        }
        */
        return inventory;
    }

    private generateProcess(targetShortage: Shortage): LabProcess {
        const currentShortage = this.recursiveShortageCheck(targetShortage, true);
        if (currentShortage === undefined) {
            console.log("IGOR: error finding current shortage in", this.operation.name);
            return;
        }
        const reagentLoads = {};
        for (const mineralType of REAGENT_LIST[currentShortage.mineralType]) {
            reagentLoads[mineralType] = currentShortage.amount;
        }
        const loadProgress = currentShortage.amount * 2;
        return {
            targetShortage,
            currentShortage,
            reagentLoads,
            loadProgress,
        };
    }

    private checkBoostRequests() {
        if (!this.room.memory.boostRequests) this.room.memory.boostRequests = {};
        const requests = this.room.memory.boostRequests as BoostRequests;

        for (const resourceType in requests) {
            const request = requests[resourceType];

            for (const id of request.requesterIds) {
                const creep = Game.getObjectById(id);
                if (!creep) {
                    request.requesterIds = _.pull(request.requesterIds, id);
                }
            }

            const flag = Game.flags[request.flagName];

            if (request.requesterIds.length === 0 && flag) {
                console.log("IGOR: removing boost flag:", flag.name);
                flag.remove();
                requests[resourceType] = undefined;
            }

            if (request.requesterIds.length > 0 && !flag) {
                request.flagName = this.placePullFlag(resourceType);
            }
        }
    }

    private placePullFlag(resourceType: string) {
        const existingFlag = Game.flags[this.operation.name + "_" + resourceType];
        if (existingFlag) return existingFlag.name;
        const labs = _.filter(this.productLabs, (l: StructureLab) => l.pos.lookFor(LOOK_FLAGS).length === 0);
        if (labs.length === 0) return;

        const closestToSpawn = this.spawnGroup.spawns[0].pos.findClosestByRange(labs);
        if (this.productLabs.length > 1) {
            this.productLabs = _.pull(this.productLabs, closestToSpawn);
        }
        const outcome = closestToSpawn.pos.createFlag(this.operation.name + "_" + resourceType);
        if (_.isString(outcome)) {
            console.log("IGOR: placing boost flag:", outcome);
            return outcome;
        }
    }

    private findIgorIdlePosition() {
        if (!this.memory.idlePosition && Game.time % 1000 === 0) {
            // start with the position that would be available following the default spec
            const positions = [this.terminal.pos.getPositionAtDirection(this.terminal.pos.getDirectionTo(this.storage))];
            for (let i = 1; i <= 8; i++) {
                // add other positions around storage
                positions.push(this.terminal.pos.getPositionAtDirection(i));
            }
            for (const position of positions) {
                // check each position for valid conditions
                if (position.lookFor(LOOK_STRUCTURES).length === 0 && position.isPassable(true) && position.isNearTo(this.storage)) {
                    console.log(`IGOR: found a good idle position in ${this.operation.name}: ${position}`);
                    this.memory.idlePosition = position;
                    break;
                }
            }

            if (!this.memory.idlePosition) {
                console.log(`IGOR: terminal placement is unoptimal at ${this.operation.name}, consider moving storage or terminal`);
            }
        }
    }
}
