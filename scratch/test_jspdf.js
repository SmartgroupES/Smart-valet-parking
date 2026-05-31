const { jsPDF } = require("jspdf");
const doc = new jsPDF();
doc.text("Hello world!", 10, 10);
const dataUri = doc.output('datauristring');
console.log(dataUri ? dataUri.substring(0, 50) : 'undefined');
