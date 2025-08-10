if (!player.stealthed) {
    // normal chase logic
}
const dist = Math.sqrt((player.x - this.x)**2 + (player.y - this.y)**2);
if (dist < this.visionRange && !player.stealthed) {
    // chase player
}
