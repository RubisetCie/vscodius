"use strict";

const rcedit = require("rcedit");
const { config } = require('./lib/electron');

// Check args
if (process.argv.length < 3) {
	console.error("You need to specify the executable path!");
	process.exit();
}

// Create patch
var patch = {
	"version-string": {
		ProductName: config.productAppName || config.productName,
		ProductVersion: config.version,
		FileDescription: config.productAppName || config.productName,
		LegalCopyright: config.copyright,
		CompanyName: config.companyName
	},
	"file-version": config.version,
	"product-version": config.version
};

// Set icon
if (config.winIcon) {
	patch.icon = config.winIcon;
}

rcedit(process.argv[2], patch, function (err) {
	if (err) {
		console.error(err.toString());
	} else {
		console.log("Executable resources replaced successfully!");
	}
});
