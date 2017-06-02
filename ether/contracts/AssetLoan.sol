pragma solidity ^0.4.9;

/** 
	@To Do:
	1. Interest rate?
	2. Fallback if the send fails to an investor account
	X. permissioning of access to functions
		- paymentExecute, who can call this!
*/

/*** @title Asset Loan */
contract AssetLoan {
	/** @dev..
	* @param..
	* @param uint _assetValue,
	* @param uint _fundingTarget, 
	* @param uint _minimumInvestmentAmount,
	* @param address borrower,
	* @param address seller,
	* @param uint paymentSize
	*/
	address owner;

	uint assetValue;

	uint fundingTarget; // the amount required to execute loan
	uint minimumInvestmentAmount; // can ensure there are not 100000... $10 investments etc.
	uint approvedInvestmentTotal; // total amount from investors the borrower has approved

	uint outstandingLoan;
	uint interestRate; // held as integer
	uint paymentSize;  // Size of payments in payback cycle

	// Associated wallet addresses to transfer value between involved parties
	address borrowerWallet;
	address sellerWallet;

	enum State {
		acceptingFunding, 
		fundingTargetReached,
		loanPaidOff
	}
	State state = State.acceptingFunding; // default

	// Array of investors in this loan
	struct Investor {
		address wallet;
		uint investment;
		uint loanOwnershipPercentage;
	}
	Investor[] investors;

	// Proposals by investors to be approved / declined
	// Investor wallet address to amount they wish to invest
	mapping(address=>uint) investmentPropsals;
	address[] potentialInvestors;


	// @Modifiers
	modifier onlyOwner {
		if(msg.sender != borrowerWallet) throw;
		_;
	}

	modifier onlyBorrower {
		if(msg.sender != borrowerWallet) throw;
		_;
	}

	modifier inState(State _state){
		if(state != _state) throw;
		_;
	}

	modifier stateTransition(State _state){
		_;
		state = _state;
	}


	// @Events
	event FundingTargetReachedEvent(address assetLoanAddress);
	event InvestmentProposalAddedEvent(address borrower, address investor, uint amount);
	event InvestmentProposalApprovedEvent(address borrower, address investor, uint amount);
	event InvestmentProposalDeclinedEvent(address borrower, address investor, uint amount);
	event InvestorPaymentMadeEvent(address assetLoanAddress, address investorWallet, uint outstaningInvestment, uint payment);
	event LoanPaidOff(address assetLoanAddress);
	event PaymentMadeEvent(address assetLoanAddress, uint amount);


	// @Constructor
	function AssetLoan(
		uint _assetValue,
		uint _fundingTarget, 
		uint _interestRate,
		uint _minimumInvestmentAmount,
		uint _paymentSize,
		address borrower,
		address seller
	){
		assetValue = _assetValue;
		borrowerWallet = borrower;
		fundingTarget = _fundingTarget;
		outstandingLoan = _fundingTarget;
		interestRate = _interestRate;
		minimumInvestmentAmount = _minimumInvestmentAmount;
		owner = msg.sender;		
		paymentSize = _paymentSize;
		sellerWallet = seller;
	}

	// @Payable
	// TODO onlyBorrower
	function fundsAdd() payable inState(State.fundingTargetReached) returns(uint) {
		// The borrower must fund this loan in order for autonomous payments to occur
		// @return balance of the contract
		return this.balance;
	}

	function investmentProposalAdd() payable inState(State.acceptingFunding) {
		// Investor would like to invest, issuing a proposal
		// Hold value in contract balance
		// @return None
		if(msg.value < minimumInvestmentAmount) throw;

		investmentPropsals[msg.sender] += msg.value;
		potentialInvestors.push(msg.sender);

		InvestmentProposalAddedEvent(borrowerWallet, msg.sender, msg.value);
	}


	// @External
	function investmentProposalApprove(
		address investor
	) external inState(State.acceptingFunding) returns(uint){
		// Seller has approved an investor
		// Payable from the escrow wallet!
		// @param investor
		// @return current total invested
		uint amount = investmentPropsals[investor];

		// Check if this investment will exceed the limit and that it exists
		// Do not allow for now, consider just taking the remainder and refunding
		if (amount == 0 || ((approvedInvestmentTotal + amount) > fundingTarget)) throw;

		// Approval successful
		approvedInvestmentTotal += amount;
		
		// Create an investor
		investors.push(Investor({
			wallet: investor,
			investment: amount,
			loanOwnershipPercentage: amount * 100 / fundingTarget // defines payback percentages
		}));

		// Clear the proposal
		investmentPropsals[investor] = 0;

		InvestmentProposalApprovedEvent(borrowerWallet, investor, amount);

		// Check if this has reached the target
		if (approvedInvestmentTotal == fundingTarget) {
			fundingTargetReached();
			FundingTargetReachedEvent(this);
		}
		
		return approvedInvestmentTotal;
	}

	// Permission this guy! onlyOwner?
	function paymentExecute() external inState(State.fundingTargetReached) returns(uint) {
		// Make payments on the loan to the involved investors
		uint investorPayment; // specific to each investor
		
		// If there is less than the paymentSize remaining then pay just the remaining balance
		if (paymentSize > outstandingLoan){
			paymentSize = outstandingLoan;
		}

		uint paymentWithInterest = paymentSize * (100 + interestRate);

		// Interest rate in integer form so multiply by 100 to compare
		if (this.balance * 100 < paymentWithInterest) { // INSUFFICIENT FUNDS
			// Define penalities for missing payments
			throw;
		}

		// Pay each investor their piece
		for (var i = 0; i < investors.length; i++){
			// Note interest rate and ownership % integers so final value will need to be / 10000
			investorPayment =  paymentWithInterest * investors[i].loanOwnershipPercentage / 10000;
			investors[i].wallet.send(investorPayment);

			// Update their oustanding investment
			investors[i].investment -= paymentSize * investors[i].loanOwnershipPercentage / 100;
			InvestorPaymentMadeEvent(this, investors[i].wallet, investors[i].investment, investorPayment);
		}

		outstandingLoan -= paymentSize;
		PaymentMadeEvent(this, paymentSize);

		// Change state that the loan has been paid off!
		if (outstandingLoan == 0){
			state = State.loanPaidOff;
			LoanPaidOff(this);
		}

		return outstandingLoan;
	}

	// @Public
	function investmentProposalDecline(
		address investor
	) public inState(State.acceptingFunding) returns(bool) {
		// Seller has declined an investor, refund the investor
		// @param investor
		// @return bool if successful / failed
		uint amount = investmentPropsals[investor];

		// Confirm this investor exists
		if (amount == 0) throw;

		// Set to 0 as to not push to their account again
		investmentPropsals[investor] = 0;

		// Try to refund the amount and reset the proposal if it fails
		if (investor.send(amount)){
			InvestmentProposalDeclinedEvent(borrowerWallet, investor, amount);
			return true;
		} else {
			investmentPropsals[investor] = amount;
			return false;
		}
	}


	// @Private
	function fundingTargetReached() private stateTransition(State.fundingTargetReached) returns(uint) {
		// Target has been reached!  Transfer funds to the seller
		// Refund all existing proposals and transfer funds to seller
		if(!sellerWallet.send(fundingTarget)) throw;

		// clear all existing proposal and refund
		investmentPropsalsClearAll();
	}

	function investmentPropsalsClearAll() private {
		// iterate over all the proposals and refund if they exist
		address investor;

		for (var i = 0; i < potentialInvestors.length; i++){
			investor = potentialInvestors[i];

			if (investmentPropsals[investor] != 0){
				investmentProposalDecline(investor);
			}
		}
	}
}