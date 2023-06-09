class Coin {
  
  PVector pos;
  PVector movement;
  float size;
  
  Coin (PVector pos, boolean moving) {
    this.pos = new PVector(pos.x, pos.y);
    if (moving == true) movement = new PVector(random(-3, 3), random(-3, 3));
    else movement = new PVector(0, 0);
    size = 15;
  }
  
  void move() {
    movement.mult(0.97);
    pos.add(new PVector(movement.x*gameSpeed, movement.y*gameSpeed));
    
    if (pos.x > width - size/2 || pos.x < size/2) movement.x += -0.9;
    if (pos.y > height - size/2 || pos.y < size/2) movement.y += -0.9;
    
    if (powerupDuration[1] > 0) {
      
      if (dist(p.pos.x, p.pos.y, pos.x, pos.y) < size/2 + p.size/2 + 400) {
        movement.add(new PVector(p.pos.x - pos.x, p.pos.y - pos.y).div(400));
      }
    }
  }
  
  void display() {
    pushMatrix();
    translate(pos.x, pos.y);
    stroke(156, 96, 0);
    strokeWeight(3);
    fill(255, 195, 15);
    ellipse(0, 0, size, size);
    popMatrix();
  }
  
  boolean collected() {
    
    if (dist(p.pos.x, p.pos.y, pos.x, pos.y) < size/2 + p.size/2 + 15) {
      bonuses.add(new Bonus(new PVector(width-50, height-120), 1, color(255)));
      return true;
    }
    return false;
  }
  
}
