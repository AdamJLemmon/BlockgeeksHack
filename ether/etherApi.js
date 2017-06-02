/** 
*	Module containing all private methods to interact with blockchain
*
*	TODO:
*	1. Load and compile contracts dynamically from .sol files
*	2. Listeners for contracts, create immediately after deploying
*	3. Update accountSetupForTransaction to add more functionality. ie check account balance
*	ensure sufficient funds, etc.
*	- Improve how fueling account is set to send transactions, secure the pass, etc.
*/
// var fs = require('fs');
// var path = require('path');
// var solc = require('solc');
var Web3 = require('web3');
var YAML = require('yamljs');

var utils = require('./utils/base');

var settings = YAML.load('./settings.yml');

// Connect to local geth node
var web3 = new Web3(
	new Web3.providers.HttpProvider("http://192.168.43.58:8545")
);


/*** @section Loan Asset Methods */
function fundsAdd(amount, callback){
	utils.debugLogOutput('Adding funds: ' + amount);

	var contract, owner, response;

	contract = contractLoad(settings.ASSET_LOAN);

	// Must send as the borrowers
	owner = accountSetupForTransaction(
		settings.BORROWER, settings.DEFAULT_PASSWORD
	);

	response = contract.fundsAdd.sendTransaction({
		from: owner,
		value: amount,
		gas: settings.DEFAULT_GAS
	});

	callback(null, response);
}

function investmentProposalAdd(investor, amount, callback){
	/***
	*/
	utils.debugLogOutput('Adding proposal: ' + investor);

	var contract, owner, response;

	contract = contractLoad(settings.ASSET_LOAN);

	// Must send as the investor
	owner = accountSetupForTransaction(
		investor, settings.DEFAULT_PASSWORD
	);

	response = contract.investmentProposalAdd.sendTransaction({
		from: owner,
		value: amount,
		gas: settings.DEFAULT_GAS
	});

	callback(null, response);
}

function investmentProposalApprove(investor, callback){
	/***
	*/
	utils.debugLogOutput('Approving proposal: ' + investor);

	var contract, owner, response;

	contract = contractLoad(settings.ASSET_LOAN);

	// Send as fueling account
	owner = accountSetupForTransaction(
		settings.FUELING_ACCOUNT, settings.DEFAULT_PASSWORD
	);

	response = contract.investmentProposalApprove.sendTransaction(
		investor, 
		{
			from: owner,
			gas: settings.DEFAULT_GAS
		}
	);

	callback(null, response);
}

function paymentExecute(callback){
	utils.debugLogOutput('Payment Execute');

	var contract, owner, response;

	contract = contractLoad(settings.ASSET_LOAN);
	owner = accountSetupForTransaction(
		settings.BORROWER, settings.DEFAULT_PASSWORD
	);

	console.log(contract.paymentExecute.call());

	response = contract.paymentExecute.sendTransaction({
		from: owner,
		gas: settings.DEFAULT_GAS
	});

	callback(null, response);
}

/*** @section Contract Specific Methods */
//exposed methods accessbile externally
function contractCreateEventListener(contract, event, callback){
	/** 
	* Helper to bind generic listeners to contract events 
	* @param {object} contract: contract instance
	* @param {string} event: event name that exists within contract
	* @callback: custom callback for this specific event
	*/
	// create generic event listener
	contract[event]().watch(function(error, result) {
		if(callback){
			callback(error, result);	
		}
		else {
			callbackDefaultEventListener(error, result);
		}
	})
}

function contractDeployAssetLoan(fileName, id, fromAccount, accountPass, callback) {
	/**
	* Deploy a specific contract, source loaded and compiled 
	* based on id, note utilized to deploy registry initially in most cases
	* @param {string} fileName: file of the contract you are deploying
	* @param {string} id: unique id to use for this contract
	* @param {eth address} fromAccount: externally owned account to send transaction
	* @param {string} accountPass: password to unlock account
	* @callback {function}
	*/
	utils.debugLogOutput('Deploying contract: ' + id);

    var owner, source, compiled, contractObject, gasEstimate;

    // Init the account to send the transaction, unlock, fund, etc.
    owner = accountSetupForTransaction(fromAccount, accountPass);
    compiled = settings.contracts[fileName]; 

    // source = contractGetSource(fileName);  // load source from contract file
    // // compile source into EVM bytecode and interface
    // compiled = contractCompileSource(source); 

	// Object to create instance of
	contractObject = web3.eth.contract(compiled['interface']); 
    gasEstimate  = web3.eth.estimateGas({data: compiled['data']});

    // instantiate and deploy contract
	contractObject.new(
		settings.ASSET_VALUE,
		settings.FUNDING_TARGET,
		settings.INTEREST_RATE,
		settings.MIN_INVESTMENT,
		settings.PAYMENT_SIZE, // uint _paymentSize,
		settings.BORROWER, // address borrower,
		settings.SELLER, //address seller, 
		{
			from: owner,
			data: compiled['data'],
			gas: gasEstimate*2
		}, function (e, contract){
			callbackContractDeployment(e, contract, id);
		}
	)

    callback(null, gasEstimate);
}

function contractLoad(fileName){
	/**
	* Load deployed contract into local object
	* @param {string} fileName: the name of the contract file, required to load
	* source and compile to get interface
	* @param {string} id: unique id of contract to load
	*/
	var contract, contractData, interface, address;

	contractData = settings.contracts[fileName];
	interface = contractData['interface'];
	address = contractData['address'];

	if (address)
		contract = web3.eth.contract(interface).at(address);

	return contract;
}


/**********
* Helpers *
**********/
// Not likey to be accessed externally
function callbackContractDeployment(e, contract, id){
	/**
	* Helper utilized when deploying a contract.  Deploy contract and update 
	* local object
	* @param {string} e: error message
	* @param {contract} contract: contract instance in the process of being deployed
	* @param {string} id: unique id to save this contract as in local object
	*/
	if(!e) {
		if(!contract.address) {
		  utils.debugLogOutput("Contract transaction sent: TransactionHash: " + contract.transactionHash + " waiting to be mined...");
		} else {
			utils.debugLogOutput("Contract mined! Address: " + contract.address);
		}
	}
	else {
		console.log("err: " + e)
	}
}

function callbackDefaultEventListener(error, result){
	/**
	* Default listener to use for contract events
	* @param {object} error: error occured during event
	* @param {object} result: the complete event result object
	*/
	utils.debugLogOutput('Event Fired!');

	if (!error)
		console.log(result);
	else
		console.log("Err: " + error);
}

function accountSetupForTransaction(account, password){
		/** Setup the given account in order to send transaction
		Unlock, fund, etc. to be expanded
		* @param {string} fileName: name of the contract file to load
		* @return {address}: eth account address once unlocked
		*/

		// If no account passed in then default to fueling
		if(!(account)){
			account = settings.FUELING_ACCOUNT;
			password = settings.DEFAULT_PASSWORD;
		}

		web3.personal.unlockAccount(account, password);
		return account;
}


function addAndApproveProposalTest(investor, amount){
	
}

function listeners(){
	var contract = contractLoad(settings.ASSET_LOAN);

	// Event listeners
	contractCreateEventListener(contract, 'InvestmentProposalAddedEvent');	
	contractCreateEventListener(contract, 'InvestmentProposalApprovedEvent');
	contractCreateEventListener(contract, 'FundingTargetReachedEvent');
	contractCreateEventListener(contract, 'InvestmentProposalDeclinedEvent');
	contractCreateEventListener(contract, 'InvestorPaymentMadeEvent');
	contractCreateEventListener(contract, 'LoanPaidOff');
	contractCreateEventListener(contract, 'PaymentMadeEvent');	
}

// // FULL DEMO TEST
// contractDeployAssetLoan(settings.ASSET_LOAN, 'assetLoan', null, null, function(e, r){});

// listeners();

// ADD
// investmentProposalAdd(settings.INVESTOR1, 10000, function(e, r){});
// investmentProposalAdd(settings.INVESTOR2, 50000, function(e, r){});
// investmentProposalAdd(settings.INVESTOR3, 40000, function(e, r){});

// APPROVE
// investmentProposalApprove(settings.INVESTOR1, function(e, r){});
// investmentProposalApprove(settings.INVESTOR2, function(e, r){});
// investmentProposalApprove(settings.INVESTOR3, function(e, r){});

// FUND
fundsAdd(100000, function(e, r){ console.log(r); });

// PAYMENT CYCLE
// paymentExecute(function(e, r) {});



