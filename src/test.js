const regex = /^260705_(\d+)/;
const match = "260705_2 GN REFUGIO".match(regex);
console.log(match ? parseInt(match[1]) : null);
