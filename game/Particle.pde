class Particle {
  
  PVector pos;
  color c;
  float size;
  float health;
  PVector vel;
  float rotation;
  
  Particle(PVector pos, color c, float size, PVector vel) {
    this.pos = pos;
    this.c = c;
    this.size = random(size*0.8, size*1.5);
    health = 210;
    this.vel = new PVector(random(-size/2 + vel.x, size/2 + vel.x), random(-size/2 + vel.y, size/2 + vel.y));
    rotation = random(0, TWO_PI);
  }
  
  void move() {
    
    vel.mult(0.91);
    size *= 0.964;
    pos.add(new PVector(vel.x*gameSpeed, vel.y*gameSpeed));
    if (vel.mag() < 0.7) health *= 0.92;
}
    
void display() {
    
    pushMatrix();
    translate(pos.x, pos.y);
    rotate(vel.mag()*gameSpeed + rotation);
    
    noStroke();
    fill(c);
    rect(-size/2, -size/2, size, size);
    
    popMatrix();
  }
  
}
