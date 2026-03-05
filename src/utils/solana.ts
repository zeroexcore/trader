import { Connection, VersionedTransaction, Transaction } from '@solana/web3.js';
import { env, requireHeliusKey, apis } from '../config.js';

/**
 * Enhanced transaction sender that supports Helius Sender for lower latency
 * Broadcasts to both validators and Jito simultaneously for best landing rates
 */
export async function sendAndConfirmTransaction(
  connection: Connection,
  transaction: VersionedTransaction | Transaction,
  options: { skipPreflight?: boolean } = {}
): Promise<string> {
  const useHeliusSender = env.useHeliusSender();
  
  let signature: string;
  
  if (useHeliusSender) {
    const apiKey = requireHeliusKey();
    const heliusRpcUrl = apis.heliusRpc(apiKey);
    
    // Create a dedicated connection for Helius Sender
    const heliusConnection = new Connection(heliusRpcUrl);
    
    if (transaction instanceof VersionedTransaction) {
      signature = await heliusConnection.sendTransaction(transaction, {
        skipPreflight: options.skipPreflight ?? true,
        maxRetries: 0, // Helius Atlas handles retries better
      });
    } else {
      signature = await heliusConnection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: options.skipPreflight ?? true,
        maxRetries: 0,
      });
    }
    console.log('🚀 Transaction submitted via Helius Sender');
  } else {
    if (transaction instanceof VersionedTransaction) {
      signature = await connection.sendTransaction(transaction, {
        skipPreflight: options.skipPreflight,
      });
    } else {
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: options.skipPreflight,
      });
    }
  }

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');
  
  return signature;
}
