/* 
	Base js helpers
*/

// quick testing helper to output clean consistent ogs
function debugLogOutput(log){
	console.log('\n--------------');
	console.log(log);
	console.log('--------------');
}

function errorLogOutput(log){
	console.log('\n*******************');
	console.log(log);
	console.log('*******************');
}


module.exports = {
	debugLogOutput: debugLogOutput,
	errorLogOutput, errorLogOutput
}