import {helper} from "../../helpers/helper";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export class TransportMission extends Mission {

    public carts: Agent[];
    public maxCarts: number;
    public origin: StructureContainer | StructureStorage | StructureTerminal;
    public destination: StructureContainer | StructureStorage | StructureTerminal;
    public resourceType: string;
    public offroad: boolean;
    public waypoints: Flag[];

    constructor(operation: Operation, maxCarts: number,
                origin?: StructureContainer | StructureStorage | StructureTerminal,
                destination?: StructureContainer | StructureStorage | StructureTerminal,
                resourceType?: string, offroad = false) {
        super(operation, "transport");
        this.maxCarts = maxCarts;
        if (origin) {
            this.origin = origin;
            this.memory.originPos = origin.pos;
        }
        if (destination) {
            this.destination = destination;
            this.memory.destinationPos = destination.pos;
        }
        this.resourceType = resourceType;
        this.offroad = offroad;
    }

    public initMission() {
        this.waypoints = [];
        if (!this.origin) {
            const originFlag = Game.flags[this.operation.name + "_origin"];
            if (originFlag) {
                this.memory.originPos = originFlag.pos;
                if (originFlag.room) {
                    this.origin = originFlag.pos.lookFor(LOOK_STRUCTURES)[0] as StructureContainer | StructureStorage | StructureTerminal;
                }
            }
        }
        if (!this.destination) {
            const destinationFlag = Game.flags[this.operation.name + "_destination"];
            if (destinationFlag) {
                this.memory.destinationPos = destinationFlag.pos;
                if (destinationFlag.room) {
                    this.destination = destinationFlag.pos.lookFor(LOOK_STRUCTURES)[0] as StructureContainer | StructureStorage | StructureTerminal;
                }
            }
        }

        this.waypoints = this.getFlagSet("_waypoints_", 1);
    }

    public roleCall() {

        const body = () => {
            if (this.offroad) {
                return this.bodyRatio(0, 1, 1, 1);
            }
            else {
                return this.bodyRatio(0, 2, 1, 1);
            }
        };

        const memory = {scavanger: this.resourceType, prep: true};
        this.carts = this.headCount("cart", body, () => this.maxCarts, {memory});
    }

    public missionActions() {

        for (const cart of this.carts) {
            if (!this.memory.originPos || !this.memory.destinationPos) {
                cart.idleNear(this.flag);
            }

            this.cartActions(cart);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private cartActions(cart: Agent) {

        const hasLoad = cart.hasLoad();
        if (!hasLoad) {
            if (!this.origin) {
                const originPos = helper.deserializeRoomPosition(this.memory.originPos);
                cart.travelTo(originPos);
            }
            else if (!cart.pos.isNearTo(this.origin)) {
                cart.travelTo(this.origin);
            }
            else {
                let outcome;
                if (this.resourceType) {
                    outcome = cart.withdraw(this.origin, this.resourceType);
                }
                else if (this.origin instanceof StructureLab) {
                    outcome = cart.withdraw(this.origin, (this.origin as StructureLab).mineralType);
                }
                else {
                    outcome = cart.withdrawEverything(this.origin);
                }
                if (outcome === OK) {
                    cart.travelTo(this.destination);
                }
            }
            return; // early
        }

        // hasLoad = true
        if (!this.destination) {
            const destinationPos = helper.deserializeRoomPosition(this.memory.destinationPos);
            cart.travelTo(destinationPos);
        }
        else if (!cart.pos.isNearTo(this.destination)) {
            cart.travelTo(this.destination);
        }
        else {
            let outcome;
            if (this.resourceType) {
                outcome = cart.transfer(this.destination, this.resourceType);
            }
            else {
                outcome = cart.transferEverything(this.destination);
            }
            if (outcome === OK) {
                cart.travelTo(this.origin);
            }
        }
    }
}
