class Explosion {
  
  PVector pos;
    //upper bound of particle size
  float size;
  int num;
  color c;
  int deathClock = 200;
    //reset variable for camera shake
  float cameraShakeTimer;
    //how much camera shake
  float mag;
  
  ArrayList<Particle> boom;
  
  Explosion(PVector pos, float size, color c) {
    this.pos = pos;
    this.size = size;
    this.c = c;
    cameraShakeTimer = 3;
    mag = size/150;
    
    num = 8;
    
    boom = new ArrayList<Particle>();
    
    for (int i = 0; i < num; i ++) 
      boom.add(new Particle(new PVector(pos.x + random(-size, size), pos.y + random(-size, size)), c, size*2, new PVector(0, 0)));
    
  }
  
  void move() {
    
    for (Particle f : boom) {
      if (pause == false) f.move();
      f.display();
    }
    
    deathClock -= gameSpeed;
    
    cameraShakeTimer += gameSpeed;
  }
  
  void quake() {
    
    if (pos.x < 5 || pos.y < 5 || pos.x > width-5 || pos.y > height-5) {} else {
      translate(sin(cameraShakeTimer/2)/cameraShakeTimer*65*mag*gameSpeed, sin(cameraShakeTimer/3)/cameraShakeTimer*90*mag*gameSpeed);
      translate(width/2, height/2);
      rotate(sin(cameraShakeTimer/15)/cameraShakeTimer*mag*0.6*gameSpeed);
      translate(-width/2, -height/2);
    }
  }
  
  boolean isDead() {
    if (deathClock <= 0) return true;
    
    return false;
  }
}
