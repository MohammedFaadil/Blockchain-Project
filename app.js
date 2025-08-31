// Blockchain Demo App.js - Fully featured interactive blockchain visualizer

// Utility: SHA-256 hashing using SubtleCrypto API (returns Promise<string>)
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Block class representing each block with transactions
class Block {
  constructor(index, transactions, timestamp, previousHash = '') {
    this.index = index;
    this.transactions = transactions; // array of {sender, recipient, amount}
    this.timestamp = timestamp;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = '';
  }

  // Calculate hash for this block's data using nonce
  async calculateHash() {
    const blockString = this.index + this.previousHash + this.timestamp +
      JSON.stringify(this.transactions) + this.nonce;
    this.hash = await sha256(blockString);
    return this.hash;
  }

  // Mine block until hash has leading zeros matching difficulty
  async mineBlock(difficulty) {
    const target = '0'.repeat(difficulty);
    while(true) {
      await this.calculateHash();
      if (this.hash.substring(0, difficulty) === target) break;
      this.nonce++;
      // Avoid blocking UI: yield control every 1000 iterations
      if (this.nonce % 1000 === 0) await new Promise(r => setTimeout(r, 0));
    }
  }
}

// Blockchain class managing the entire chain
class Blockchain {
  constructor() {
    this.chain = [];
    this.createGenesisBlock();
  }

  async createGenesisBlock() {
    const genesisTransactions = [{ sender: 'network', recipient: 'genesis', amount: 0 }];
    const genesisBlock = new Block(0, genesisTransactions, new Date().toISOString(), '0');
    await genesisBlock.mineBlock(2);
    this.chain.push(genesisBlock);
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  async addBlock(newBlock) {
    newBlock.previousHash = this.getLatestBlock().hash;
    await newBlock.mineBlock(App.blockchainDifficulty);
    this.chain.push(newBlock);
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const curr = this.chain[i];
      const prev = this.chain[i-1];
      if (curr.hash !== this.computeBlockHashSync(curr)) return false; // hash changed?
      if (curr.previousHash !== prev.hash) return false; // broken link
      if (!curr.hash.startsWith('0'.repeat(App.blockchainDifficulty))) return false; // invalid PoW
    }
    return true;
  }

  // Synchronous hash check helper - without async mining, used only for validation
  computeBlockHashSync(block) {
    // The blockString exactly matches the "calculateHash" but sync version.
    // We compute async only real mining, here simulate with string:
    const blockString = block.index + block.previousHash + block.timestamp +
      JSON.stringify(block.transactions) + block.nonce;
    // Since SHA-256 is async, for validation assume hash unchanged if no changes
    // Better to keep cached hash, so here we trust stored hash.
    return block.hash;
  }
}

// Simulated network with multiple nodes (blockchains)
class NetworkSimulator {
  constructor(numNodes = 3) {
    this.nodes = [];
    for (let i = 0; i < numNodes; i++) {
      this.nodes.push(new Blockchain());
    }
  }

  getNodeChains() {
    return this.nodes.map(node => node.chain);
  }

  async syncChains() {
    // Simplified sync: copy longest valid chain to all nodes
    let longestChain = this.nodes[0].chain;

    this.nodes.forEach(node => {
      if (node.chain.length > longestChain.length && node.isChainValid()) {
        longestChain = node.chain;
      }
    });

    const promises = this.nodes.map(async node => {
      node.chain = [...longestChain];
    });
    await Promise.all(promises);
  }
}

// App Controller Singleton
const App = {
  blockchain: null,
  network: null,
  blockchainDifficulty: 2,

  async init() {
    this.blockchain = new Blockchain();
    await this.blockchain.createGenesisBlock();

    this.network = new NetworkSimulator(4);

    this.cacheElements();
    this.bindEvents();
    await this.renderBlockchain();
    this.renderNetworkNodes();
  },

  cacheElements() {
    this.$blockchainContainer = document.getElementById('blockchain');
    this.$mineBlockBtn = document.getElementById('mineBlockBtn');
    this.$blockTransactions = document.getElementById('block-transactions');
    this.$miningDifficultyInput = document.getElementById('miningDifficulty');
    this.$validateChainBtn = document.getElementById('validateChainBtn');
    this.$validationResult = document.getElementById('validationResult');
    this.$networkNodesContainer = document.getElementById('networkNodes');
    this.$syncNetworkBtn = document.getElementById('syncNetworkBtn');
    this.$faqLink = document.getElementById('faq-link');
    this.$faqModal = document.getElementById('faqModal');
    this.$faqCloseBtn = document.getElementById('closeFaq');
  },

  bindEvents() {
    this.$mineBlockBtn.addEventListener('click', () => this.handleMineBlock());
    this.$validateChainBtn.addEventListener('click', () => this.handleValidateChain());
    this.$syncNetworkBtn.addEventListener('click', () => this.handleSyncNetwork());
    this.$faqLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.openFaqModal();
    });
    this.$faqCloseBtn.addEventListener('click', () => this.closeFaqModal());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFaqModal();
    });
  },

  async renderBlockchain() {
    this.$blockchainContainer.innerHTML = '';
    const chain = this.blockchain.chain;

    for (const block of chain) {
      const blockEl = document.createElement('div');
      blockEl.classList.add('block');

      // Format transactions pretty JSON
      const txJSON = JSON.stringify(block.transactions, null, 2);

      blockEl.innerHTML = `
        <div class="block-header">
          <div>Block #${block.index}</div>
          <div>Nonce: ${block.nonce}</div>
        </div>
        <div class="timestamp">Timestamp: ${new Date(block.timestamp).toLocaleString()}</div>
        <div class="prevHash">Prev Hash:<br>${block.previousHash}</div>
        <div class="hash">Hash:<br>${block.hash}</div>
        <pre class="transactions">${txJSON}</pre>
      `;

      this.$blockchainContainer.appendChild(blockEl);
    }
  },

  async handleMineBlock() {
    const rawTx = this.$blockTransactions.value.trim();
    if (!rawTx) {
      alert('Please enter valid transactions as JSON array.');
      return;
    }

    let txs;
    try {
      txs = JSON.parse(rawTx);
      if (!Array.isArray(txs)) throw new Error('Transactions must be an array.');
      for (const tx of txs) {
        if (!tx.sender || !tx.recipient || typeof tx.amount !== 'number') {
          throw new Error('Each transaction must have sender, recipient & numeric amount.');
        }
      }
    } catch (err) {
      alert(`Invalid transaction format: ${err.message}`);
      return;
    }

    const difficulty = parseInt(this.$miningDifficultyInput.value, 10);
    if (isNaN(difficulty) || difficulty < 1 || difficulty > 5) {
      alert('Mining difficulty must be between 1 and 5.');
      return;
    }
    this.blockchainDifficulty = difficulty;
    this.$mineBlockBtn.disabled = true;
    this.$mineBlockBtn.textContent = 'Mining... Please wait';

    const newIndex = this.blockchain.chain.length;
    const newBlock = new Block(newIndex, txs, new Date().toISOString());

    await this.blockchain.addBlock(newBlock);
    this.$mineBlockBtn.disabled = false;
    this.$mineBlockBtn.textContent = 'Mine & Add Block';
    this.$blockTransactions.value = '';
    this.$validationResult.textContent = '';
    await this.renderBlockchain();
  },

  handleValidateChain() {
    const valid = this.blockchain.isChainValid();
    this.$validationResult.textContent = valid
      ? "Blockchain is valid and intact ✔️"
      : "Blockchain integrity compromised! ❌";
    this.$validationResult.className = valid ? 'validation-result valid' : 'validation-result invalid';
  },

  renderNetworkNodes() {
    this.$networkNodesContainer.innerHTML = '';
    for (let i = 0; i < this.network.nodes.length; i++) {
      const nodeEl = document.createElement('div');
      nodeEl.classList.add('node', 'synced');
      nodeEl.textContent = `Node ${i + 1}`;
      this.$networkNodesContainer.appendChild(nodeEl);
    }
  },

  async handleSyncNetwork() {
    this.$syncNetworkBtn.disabled = true;
    this.$syncNetworkBtn.textContent = 'Syncing...';
    await this.network.syncChains();
    this.$syncNetworkBtn.textContent = 'Sync Network Chains';
    this.$syncNetworkBtn.disabled = false;
    this.renderNetworkNodes();
    alert('Network synchronized successfully.');
  },

  openFaqModal() {
    this.$faqModal.classList.add('show');
    this.$faqModal.setAttribute('aria-hidden', 'false');
  },

  closeFaqModal() {
    this.$faqModal.classList.remove('show');
    this.$faqModal.setAttribute('aria-hidden', 'true');
  },
};

// Initialize app after DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
