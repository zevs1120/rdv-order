export interface BrokerSnapshot {
  buying_power: number;
  cash: number;
  positions: Array<{
    symbol: string;
    qty: number;
    market_value: number;
  }>;
}

export interface ExchangeSnapshot {
  balances: Array<{
    asset: string;
    free: number;
    locked: number;
  }>;
  positions: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entry: number;
    unrealized_pnl: number;
  }>;
}

export interface BrokerAdapter {
  provider: string;
  fetchSnapshot(): Promise<BrokerSnapshot>;
}

export interface ExchangeAdapter {
  provider: string;
  fetchSnapshot(): Promise<ExchangeSnapshot>;
}

class MockBrokerAdapter implements BrokerAdapter {
  constructor(public provider: string) {}

  async fetchSnapshot(): Promise<BrokerSnapshot> {
    return {
      buying_power: 42000,
      cash: 18750,
      positions: [
        { symbol: 'SPY', qty: 14, market_value: 7112 },
        { symbol: 'AAPL', qty: 20, market_value: 4200 }
      ]
    };
  }
}

class MockExchangeAdapter implements ExchangeAdapter {
  constructor(public provider: string) {}

  async fetchSnapshot(): Promise<ExchangeSnapshot> {
    return {
      balances: [
        { asset: 'USDT', free: 8520, locked: 0 },
        { asset: 'BTC', free: 0.081, locked: 0.0 }
      ],
      positions: [
        {
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 0.05,
          entry: 68420,
          unrealized_pnl: 72
        }
      ]
    };
  }
}

export function createBrokerAdapter(provider: string): BrokerAdapter {
  return new MockBrokerAdapter(provider);
}

export function createExchangeAdapter(provider: string): ExchangeAdapter {
  return new MockExchangeAdapter(provider);
}
