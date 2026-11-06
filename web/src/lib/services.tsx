import { createContext, useContext } from 'react';
import { api, type ChainProof, type Item, type VoiceReply } from '../api';

/**
 * The few things the screen asks the server for on its own (a merchant's voice, the gazette, the chain proof).
 * The game uses the real server; the demo video supplies recorded answers instead, so it can render the same
 * screen without a server.
 */
export interface Services {
  voice(merchant: string, item: Item): Promise<VoiceReply>;
  gazette(): Promise<string[] | null>;
  chain(): Promise<ChainProof | null>;
}

export const realServices: Services = { voice: api.voice, gazette: api.gazette, chain: api.chain };

const ServicesContext = createContext<Services>(realServices);
export const ServicesProvider = ServicesContext.Provider;
export const useServices = () => useContext(ServicesContext);
