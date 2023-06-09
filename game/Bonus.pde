class Bonus {
  
  PVector pos;
  float move;
  int amount;
  color c;
  
  Bonus (PVector pos, int amount, color c) {
    this.pos = pos;
    this.amount = amount;
    move = 2;
    this.c = c;
  }
  
  void display() {
    move *= 0.98;
    
    pos.add(new PVector(0, -move*gameSpeed));
    
    fill(c, move*16);
    textAlign(CENTER, CENTER);
    textFont(font);
    textSize(30 + sqrt(amount) * 2);
    text("+" + amount, pos.x, pos.y);
  }
  
  boolean isDead() {
    if (move < 0.1) return true;
    return false;
  }
}
