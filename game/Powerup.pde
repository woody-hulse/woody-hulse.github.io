class Powerup {
  
  PVector pos;
  
    //size
  float s;
    //rotation
  float w;
    //colors
  color c1, c2;
    //type
  int type;
  boolean increasing = false;
  
  Powerup(PVector pos, int type) {
    this.pos = pos;
    this.type = type;
    s = p.size*0.8;
    w = 1;
    
      //coin magnet
    if (type == 1) c1 = color(205, 55, 7);
      //infinite ammo
    if (type == 2) c1 = color(255, 140, 0);
      //mega coin
    if (type == 3) c1 = color(255, 195, 15);
      //regen
    if (type == 4) c1 = color(7, 186, 55);
      //sheild
    if (type == 5) c1 = color(20, 147, 201);
  }
  
  void display() {
    
    if (pause == false) {
      if (increasing == true) w += 0.01*gameSpeed;
      else w -= 0.01*gameSpeed;
    }
    
    if (w < 0.1) increasing = true;
    if (w > 1) increasing = false;
    
    pushMatrix();
    translate(pos.x, pos.y);
      
    stroke(c1);
    strokeWeight(s/8 + 1.4);
    noFill();
    ellipse(0, 0, s, s);
    
    popMatrix();
    
  }
  
  boolean used() {
    if (dist(p.pos.x, p.pos.y, pos.x, pos.y) < s + p.size) {
      
        //coin magnet
      if (type == 1) {
        
        powerupDuration[1] = 1000;
        
        for (int i = 0; i < active.length; i++) {
          if (active[i] == 0 || active[i] == type) {
            active[i] = type;
            i = active.length;
          }
        }
        
        //infinite ammo
      } else if (type == 2) {
        
        powerupDuration[2] = 1000;
        
        for (int i = 0; i < active.length; i++) {
          if (active[i] == 0 || active[i] == type) {
            active[i] = type;
            i = active.length;
          }
        }
        
        //mega coin
      } else if (type == 3) {
        
        collectedCoins += amount[type];
        bonuses.add(new Bonus(new PVector(width-50, height-80), amount[type], color(255)));
        
        //regen
      } else if (type == 4) {
        
        if (p.health > 150) { 
          p.health = 200; 
          bonuses.add(new Bonus(new PVector(width/2 - 500 + p.health*4, 50), floor(200 - p.health), color(255)));
        } else {
          p.health += amount[type];
          bonuses.add(new Bonus(new PVector(width/2 - 500 + p.health*4, 50), amount[type], color(255)));
        }
        
        //sheild
      } else if (type == 5) {
        
        powerupDuration[5] = 1000;
        
        for (int i = 0; i < active.length; i++) {
          if (active[i] == 0 || active[i] == type) {
            active[i] = type;
            i = active.length;
          }
        }
        
      }
     
      explosions.add(new Explosion(new PVector(pos.x, pos.y), s/6, c1));
      
      return true;
    }
    
    return false;
  }
}
