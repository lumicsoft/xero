let provider, signer, contract;

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0xe93731eEdDb1C8770138727175324ECf23c9Ef19"; 
const USDT_TOKEN_ADDRESS = "YOUR_USDT_TOKEN_ADDRESS"; // Yahan apna USDT address daalein
const TESTNET_CHAIN_ID = 97;

// --- RANK CONFIG (Star1 to Master King) ---
// Contract ke checkAndUpgradeRank logic ke anusar updated
const RANK_DETAILS = [
    { name: "None", count: 0, vol: 0 },          // Index 0
    { name: "1 Star", count: 5000, vol: 2000 },    // Rank 1
    { name: "2 Star", count: 10000, vol: 4000 }, // Rank 2
    { name: "3 Star", count: 25000, vol: 7000 },   // Rank 3
    { name: "4 Star", count: 500000, vol: 20000 }, // Rank 4
    { name: "5 Star", count: 100000, vol: 40000 },  // Rank 5
    { name: "6 Star", count: 200000, vol: 80000 }, // Rank 6
    { name: "7 Star", count: 500000, vol: 120000 } // Rank 7
];

const CONTRACT_ABI = [
    "function register(address referrer) external",
    "function deposit(uint256 amount) external",
    "function claimRoi() external",
    "function withdraw() external",
    "function users(address) view returns (bool isRegistered, address referrer, uint256 totalDeposit, uint256 totalWithdrawn, uint256 roiIncome, uint256 referralIncome, uint256 levelIncome, uint256 rankBonus, uint8 rank, uint256 lastUpdate)",
    "function userStats(address) view returns (uint256 totalRoiEarned, uint256 totalReferralEarned, uint256 totalLevelEarned, uint256 totalRankBonusEarned, uint256 directBusiness, uint256 teamBusiness, uint256 teamCount)",
    "function getHistory(address user) external view returns (tuple(string category, address fromUser, uint256 amount, uint256 timestamp)[])",
    "function getUserDetails(address user) external view returns (uint256 totalDeposit, uint256 totalWithdrawn, uint8 rank, uint256 roiIncome, uint256 referralIncome, uint256 levelIncome, uint256 rankBonus)",
    "function getUserStats(address user) external view returns (uint256 teamCount, uint256 directBusiness, uint256 teamBusiness, uint256 totalRoi, uint256 totalRef, uint256 totalLevel, uint256 totalRankBonus)",
    "function getUserRank(address user) external view returns (uint8)",
    "function getUserDepositPositions(address user) external view returns (tuple(uint256 amount, uint256 roiPercent, uint256 timestamp, bool isActive)[])",
    "function getLevelTeam(address user, uint8 level) external view returns (address[])"
];

const ERC20_ABI = ["function approve(address spender, uint256 amount) public returns (bool)", "function allowance(address owner, address spender) public view returns (uint256)"];

const calculateGlobalROI = () => 0.90;

// --- 1. AUTO-FILL LOGIC ---
async function checkReferralURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = urlParams.get('ref'); 
    const refField = document.getElementById('reg-referrer');
    
    if (refParam && refField) {
        if (ethers.utils.isAddress(refParam)) {
            refField.value = refParam.trim();
        } else {
            try {
                const address = await contract.usernameToAddress(refParam);
                refField.value = address;
            } catch (e) {
                console.log("Username not found, using as is:", refParam);
                refField.value = refParam.trim();
            }
        }
        console.log("Referral processed:", refField.value);
    }
}

async function init() {
    checkReferralURL();

    try {
        if (window.ethereum) {
            provider = new ethers.providers.Web3Provider(window.ethereum, "any");
            
            // --- AUTO NETWORK SWITCH LOGIC ---
            const network = await provider.getNetwork();
            if (network.chainId !== TESTNET_CHAIN_ID) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x61' }], // 97 = 0x61 (BSC Testnet)
                    });
                    window.location.reload();
                    return; 
                } catch (switchError) {
                    console.warn("User denied network switch.");
                }
            }

            // Read-only contract instance
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            window.contract = contract;

            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                signer = provider.getSigner();
                window.signer = signer;
                
                // Signer ke sath contract instance
                contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
                window.contract = contract; 
                
                // --- CONTRACT BASED REGISTRATION CHECK ---
                // Contract ke 'users' mapping (isRegistered: bool) se check
                const userData = await contract.users(accounts[0]);
                const isRegistered = userData.isRegistered; // Boolean status
                
                console.log("User Registered:", isRegistered);
                await setupApp(accounts[0], isRegistered);
            }

            // Listeners
            window.ethereum.on('chainChanged', () => window.location.reload());
            window.ethereum.on('accountsChanged', (accs) => {
                if (accs.length === 0) localStorage.removeItem('userAddress');
                else localStorage.setItem('userAddress', accs[0]);
                window.location.reload();
            });
        }
    } catch (error) {
        console.error("Init Error:", error);
    }
}

// --- CORE LOGIC ---
window.handleDeposit = async function() {
    const amountInput = document.getElementById('deposit-amount');
    const depositBtn = event.target; 
    
    // Min deposit check (Contract ke anusar 50 USDT)
    if (!amountInput || !amountInput.value || parseFloat(amountInput.value) < 50) {
        return alert("Min 50 USDT required!");
    }

    try {
        let activeSigner = window.signer || provider.getSigner();
        // CONTRACT_ADDRESS wahi rahega jo aapne deploy kiya hai
        let activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, activeSigner);

        depositBtn.disabled = true;
        depositBtn.innerText = "APPROVING...";

        const amountInWei = ethers.utils.parseUnits(amountInput.value.toString(), 18);
        
        // USDT Token Contract (Yahan aapka USDT address hona chahiye)
        const usdtToken = new ethers.Contract(USDT_TOKEN_ADDRESS, ERC20_ABI, activeSigner);

        // 1. Approval Step: USDT ko contract ke liye approve karein
        const allowance = await usdtToken.allowance(await activeSigner.getAddress(), CONTRACT_ADDRESS);
        if (allowance.lt(amountInWei)) {
            const approveTx = await usdtToken.approve(CONTRACT_ADDRESS, amountInWei);
            await approveTx.wait();
        }

        depositBtn.innerText = "DEPOSITING...";

        // 2. Deposit Step: Contract ke 'deposit' function ko call karein
        // deposit(uint256 _amount)
        const depositGas = await activeContract.estimateGas.deposit(amountInWei);
        const tx = await activeContract.deposit(amountInWei, { 
            gasLimit: depositGas.mul(150).div(100) 
        });
        
        await tx.wait();
        
        alert("Deposit Successful!");
        location.reload(); 
    } catch (err) {
        console.error("Deposit Error:", err);
        alert("Error: " + (err.data?.message || err.message || "Transaction Failed"));
        depositBtn.innerText = "DEPOSIT"; // Button ka original text
        depositBtn.disabled = false;
    }
}

window.handleClaimROI = async function(stakeIndex = 0) {
    const claimBtn = event.target;
    try {
        claimBtn.disabled = true; claimBtn.innerText = "CLAIMING...";
        const activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider.getSigner());
        const tx = await activeContract.claimROI(stakeIndex);
        await tx.wait();
        alert("ROI Claimed Successfully!");
        location.reload(); 
    } catch (err) {
        alert("Claim failed: " + (err.reason || err.message));
        claimBtn.disabled = false; claimBtn.innerText = "CLAIM ROI";
    }
}
window.handleRequestUnstake = async function(stakeIndex = 0) {
    try {
        const activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider.getSigner());
        const tx = await activeContract.requestUnstake(stakeIndex);
        await tx.wait();
        alert("Unstake Requested! Wait 14 days to claim.");
    } catch (err) { alert("Error: " + err.message); }
}
window.handleWithdraw = async function() {
    const amount = document.getElementById('withdraw-amount').value;
    if(!amount || amount <= 0) return alert("Enter valid amount");
    try {
        const amountInWei = ethers.utils.parseUnits(amount.toString(), 18);
        const tx = await window.contract.withdraw(amountInWei);
        await tx.wait();
        alert("Withdrawal Successful!");
        location.reload();
    } catch (err) { alert("Withdraw Error: " + (err.reason || err.message)); }
}
window.handleClaimUnstake = async function(stakeIndex = 0) {
    try {
        const activeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider.getSigner());
        const tx = await activeContract.claimUnstake(stakeIndex);
        await tx.wait();
        alert("Capital Claimed!");
        location.reload();
    } catch (err) { alert("Error: " + err.message); }
}


window.handleCompoundDaily = async function() {
    const compoundBtn = event.target;
    const originalText = compoundBtn.innerText;
    try {
        compoundBtn.disabled = true; compoundBtn.innerText = "WAITING...";
        const tx = await contract.reinvestMatured();
        compoundBtn.innerText = "REINVESTING...";
        await tx.wait();
        alert("Reinvestment Successful!");
        location.reload(); 
    } catch (err) {
        alert("Reinvest failed: " + (err.reason || err.message));
        compoundBtn.innerText = originalText; compoundBtn.disabled = false;
    }
}

window.handleLogin = async function() {
    try {
        if (!window.ethereum) return alert("Please install Trust Wallet or MetaMask!");
        
        // 1. Accounts fetch karein
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const userAddress = accounts[0];

        // 2. Contract se user data fetch karein
        // contract.users(address) humein User struct return karta hai
        const userData = await contract.users(userAddress);

        // 3. 'isRegistered' boolean check karein (contract ke struct ke anusar)
        if (userData.isRegistered === true) { 
            localStorage.setItem('userAddress', userAddress); 
            window.location.href = "index1.html"; 
        } else { 
            alert("Not registered!"); 
            window.location.href = "register.html"; 
        }
    } catch (err) { 
        console.error("Login Error:", err); 
        alert("Login failed. Check console for details.");
    }
}
window.handleRegister = async function() {
    const refField = document.getElementById('reg-referrer');
    const regBtn = event.target;
    if (!refField || !ethers.utils.isAddress(refField.value.trim())) return alert("Valid Referrer Address is required!");
    try {
        regBtn.disabled = true; regBtn.innerText = "REGISTERING...";
        const tx = await contract.register(refField.value.trim(), { gasLimit: 300000 });
        await tx.wait();
        localStorage.setItem('userAddress', await signer.getAddress());
        alert("Registration Successful!");
        window.location.href = "index1.html";
    } catch (err) { alert("Error: " + (err.reason || "Registration failed.")); regBtn.disabled = false; }
}

window.handleLogout = function() {
    if (confirm("Disconnect and Logout?")) { localStorage.clear(); window.location.href = "index.html"; }
}

function showLogoutIcon(address) {
    const btn = document.getElementById('connect-btn');
    const logout = document.getElementById('logout-icon-btn');
    if (btn) btn.innerText = address.substring(0, 6) + "..." + address.substring(38);
    if (logout) logout.style.display = 'flex'; 
}

async function setupApp(address) {
    if (!address) return;
    localStorage.setItem('userAddress', address);

    // 1. नेटवर्क चेक और ऑटो-स्विचिंग
    try {
        const network = await provider.getNetwork();
        if (network.chainId !== TESTNET_CHAIN_ID) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x61' }], // 97 = 0x61
                });
                window.location.reload();
                return;
            } catch (switchError) {
                if (switchError.code === 4902) {
                    alert("Please add BSC Testnet to your wallet.");
                } else {
                    alert("Please switch to BSC Testnet manually.");
                }
            }
        }
    } catch (err) {
        console.error("Network check failed:", err);
    }

    // 2. कॉन्ट्रैक्ट डेटा और रिडायरेक्शन लॉजिक
    // userData mein ab 'isRegistered' boolean milega
    const userData = await contract.users(address);
    const path = window.location.pathname;

    console.log("User Registered Status:", userData.isRegistered);

    // logic: userData.isRegistered ka use karein
    if (!userData.isRegistered && !path.includes('register.html')) {
        window.location.href = "register.html";
        return;
    } else if (userData.isRegistered && path.includes('register.html')) {
        window.location.href = "index1.html";
        return;
    }

    updateNavbar(address);
    showLogoutIcon(address);
    if (path.includes('index1.html')) fetchAllData(address);
}

window.fetchBlockchainHistory = async function(categories) {
    try {
        const address = await window.signer.getAddress();
        const finalLogs = [];

        // 1. STAKE DATA (Name check: 'DEPOSIT' हटाकर 'STAKE' किया)
        if (categories.includes('STAKE')) { 
            const count = await window.contract.getStakeCount(address);
            console.log("Total Stakes found:", count.toString());

            for (let i = 0; i < count; i++) {
                const s = await window.contract.getStake(address, i);
                
                // डेटा मैपिंग - कॉन्ट्रैक्ट के अनुसार
                const amount = s.amount !== undefined ? s.amount : s[0];
                const startTime = s.startTime !== undefined ? s.startTime : s[1];
                const withBurn = s.withBurn !== undefined ? s.withBurn : s[4];

                if (amount) {
                    finalLogs.push({
                        type: 'STAKE', // UI में भी 'STAKE' दिखेगा
                        amount: parseFloat(ethers.utils.formatUnits(amount.toString(), 18)).toFixed(2),
                        date: new Date(startTime * 1000).toLocaleDateString(),
                        time: new Date(startTime * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                        detail: withBurn ? "With Burn" : "Standard"
                    });
                }
            }
        }

        // 2. INCOME DATA (नाम चेक)
        const incomeLogs = await window.contract.getIncomeHistory(address);
        if (incomeLogs && incomeLogs.length > 0) {
            incomeLogs.forEach(item => {
                const incomeType = item.incomeType || item[0];
                const amount = item.amount || item[1];
                const timestamp = item.timestamp || item[2];

                if (categories.includes(incomeType.toUpperCase())) {
                    finalLogs.push({
                        type: incomeType.toUpperCase(),
                        amount: parseFloat(ethers.utils.formatUnits(amount.toString(), 18)).toFixed(2),
                        date: new Date(timestamp * 1000).toLocaleDateString(),
                        time: new Date(timestamp * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                        detail: incomeType
                    });
                }
            });
        }

        return finalLogs;
    } catch (e) {
        console.error("DEBUG: History Error Trace:", e);
        return [];
    }
}

async function fetchAndDisplayData() {
    console.log("Fetching Leadership Data...");
    try {
        if (!window.contract || !window.signer) {
            console.error("Contract/Signer not ready");
            return;
        }

        const userAddress = await window.signer.getAddress();
        
        // 1. Fetch data from Contract
        // getUserStats returns: (teamCount, directBusiness, teamBusiness, totalRoi, totalRef, totalLevel, totalRankBonus)
        const stats = await window.contract.getUserStats(userAddress);
        const userData = await window.contract.users(userAddress);
        
        // 2. Data Destructuring
        const teamCount = parseInt(stats[0].toString());
        const teamBusiness = parseFloat(ethers.utils.formatEther(stats[2])); // teamBusiness is at index 2
        const totalRankBonus = parseFloat(ethers.utils.formatEther(stats[6])); // totalRankBonus at index 6
        const currentRank = parseInt(userData.rank); // Rank is uint8 in User struct

        console.log("Stats Loaded:", { teamCount, teamBusiness, currentRank });

        // 3. UI Updates
        // Team Total Deposit
        if(document.getElementById('team-total-deposit')) 
            document.getElementById('team-total-deposit').innerText = teamBusiness.toFixed(2);
        
        // Team Count
        if(document.getElementById('current-team-count')) 
            document.getElementById('current-team-count').innerText = teamCount;
        
        // Rank Reward Available
        if(document.getElementById('rank-reward-available')) 
            document.getElementById('rank-reward-available').innerText = totalRankBonus.toFixed(2);

        // 4. Progress Bar Update (Rank index)
        if(window.rankPlan) {
            // Rank 0-7 ko map karein
            const safeRankIndex = currentRank; 
            
            if(typeof window.updateLeadershipUI === 'function') {
                window.updateLeadershipUI(teamCount, teamBusiness, safeRankIndex);
            }
        }
    } catch (error) {
        console.error("Data Load Error:", error);
    }
}



// --- UPDATED fetchAllData FUNCTION ---
async function fetchAllData(address) {
    const refUrl = `${window.location.origin}/register.html?ref=${address}`; 
    const refInput = document.getElementById('refURL');
    if(refInput) refInput.value = refUrl;
    
    // Address display fix
    const addrDisplay = document.getElementById('user-address');
    if(addrDisplay) addrDisplay.innerText = address;
    
    try {
        // 1. Contract se dono main structures fetch karein
        const userData = await contract.users(address);
        const stats = await contract.userStats(address);

        // --- 2. User Data Display (User Struct) ---
        // userData: (isRegistered, referrer, totalDeposit, totalWithdrawn, roiIncome, referralIncome, levelIncome, rankBonus, rank, lastUpdate)
        updateText('total-deposit', format(userData.totalDeposit));
        updateText('total-withdrawn', format(userData.totalWithdrawn));
        updateText('roi-income', format(userData.roiIncome));
        updateText('referral-income', format(userData.referralIncome));
        updateText('level-income', format(userData.levelIncome));
        updateText('rank-bonus', format(userData.rankBonus));
        updateText('user-rank', userData.rank.toString());

        // --- 3. Stats Data Display (UserStats Struct) ---
        // stats: (totalRoiEarned, totalReferralEarned, totalLevelEarned, totalRankBonusEarned, directBusiness, teamBusiness, teamCount)
        updateText('total-roi-earned', format(stats.totalRoiEarned));
        updateText('total-ref-earned', format(stats.totalReferralEarned));
        updateText('total-level-earned', format(stats.totalLevelEarned));
        updateText('total-rank-earned', format(stats.totalRankBonusEarned));
        updateText('direct-business', format(stats.directBusiness));
        updateText('team-business', format(stats.teamBusiness));
        updateText('team-count', stats.teamCount.toString());

        // --- 4. Total Combined Income (User Requirement) ---
        // Total Income = ROI + Referral + Level + Rank Bonus
        const totalEarned = userData.roiIncome
                            .add(userData.referralIncome)
                            .add(userData.levelIncome)
                            .add(userData.rankBonus);
        updateText('total-earned-combined', format(totalEarned));

    } catch (err) {
        console.error("Data Sync Error:", err);
    }
}
// Ensure ki 'format' function ethers.utils ka use kar raha ho
const format = (val) => val ? parseFloat(ethers.utils.formatUnits(val, 18)).toFixed(2) : "0.00";
const updateText = (id, val) => document.querySelectorAll(`[id="${id}"]`).forEach(el => el.innerText = val);
function updateNavbar(addr) { const btn = document.getElementById('connect-btn'); if(btn) btn.innerText = addr.substring(0,6) + "..." + addr.substring(38); }

window.addEventListener('load', init);
