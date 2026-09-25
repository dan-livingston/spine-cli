export interface Processes {
	answersVersion(bin: string): Promise<boolean>;
	run(bin: string, args: string[], stdin?: Uint8Array[]): Promise<void>;
}
