class Knife extends Gun {
  
    //is knife thrown
  boolean thrown;
    //direction knife is thrown
  PVector direction;
    //where knife is thrown from
  PVector returnPoint;
    //how fast is knife
  float speed;
    //how long before knife runs out of energy
  float dropTimer;
  
  Knife(PVector pos) {
    super(pos);
    
    thrown = false;
    offset = -6;
    speed = 20;
    dropTimer = 0;
    damage = 50;
    canStab = true;
    size = p.size*0.8;
  }
  
  void move() {
    
    if (!mobile)
      dir = new PVector(mouseX - p.pos.x, mouseY - p.pos.y);
    else if (closestEnemy != null)
      dir = new PVector(closestEnemy.pos.x = p.pos.x, closestEnemy.pos.y - p.pos.y);
    dir.normalize();
    
    if (carrying == true) {
      
      if (keyPressed && key == 'e' && thrown == false) {
        thrown = true;
        pos = new PVector(p.pos.x, p.pos.y);
        direction = new PVector(dir.x, dir.y);
        groundAnimation = 0;
        returnPoint = new PVector(p.pos.x, p.pos.y);
        dropTimer = 0;
        carrying = false;
        if (powerupDuration[2] <= 0) speed = 20;
        else speed = 40;
      }
      
    }
    
    if (thrown == true) {
      
    carrying = false;
    speed *= 0.98;
        
      pos.add(new PVector (direction.normalize().mult(speed).x*(gameSpeed/2+0.5), direction.normalize().mult(speed).y*(gameSpeed/2+0.5)));
        
      for (Enemy e : enemies) {
        if (dist(e.pos.x, e.pos.y, pos.x, pos.y) < p.size/2 + e.size/2 + 5) {
          e.health -= damage;
          carrying = false;
          speed *= 0.7;
          direction.x = random(0, TWO_PI);
          direction.y = random(0, TWO_PI);
          direction.normalize();
          pos.add(new PVector(direction.x * e.size/3, direction.y * e.size/3));
          explosions.add(new Explosion(pos, 15, color(255))); 
        }
      }
      
      if (pos.x > width-p.size/2 || pos.x < p.size/2) { direction.x *= -1; speed *= 0.9; pos.add(direction); }
      if (pos.y > height-p.size/2 || pos.y < p.size/2) { direction.y *= -1; speed *= 0.9; pos.add(direction); }
      
      if (speed < 0.5) thrown = false;
    }
    
    if (carrying == false) {
      if (dist(p.pos.x, p.pos.y, pos.x, pos.y) <= p.size/2 + size/2 + 20) {
        carrying = true;
        if (speed <= 12) speed = 0;
      }
      
      canStab = false;
    } else canStab = true;
  }
  
  void display() {
    
    super.display();
    
    pushMatrix();
        
    if (carrying == true) {

      translate(p.pos.x, p.pos.y);
        
      if (dir.x >= 0) rotate(atan(dir.y/dir.x));
      else rotate(atan(dir.y/dir.x) + PI);
      
    } else {
      
      if (thrown == true) {
        
        translate(pos.x, pos.y);
        
        groundAnimation += 0.2;
        
      } else {
        translate(pos.x, pos.y);
      }
      
    }
    
    if (carrying == false) {
      
      PVector throwAngle = new PVector(direction.x, direction.y);
      throwAngle.normalize();
      
      if (throwAngle.x >= 0) rotate(atan(throwAngle.y/throwAngle.x));
      else rotate(atan(throwAngle.y/throwAngle.x) + PI);
      
      rotate(speed);
    }
    
    noStroke();
    fill(102, 60, 0);
    rect(-size*0.15, -size*0.7, size*0.3, size*0.6);
    fill(100);
    ellipse(0, -size*0.7, size*0.5, size*0.5);
    if (powerupDuration[2] <= 0) fill(playerColor);
    else fill(255, 140, 0);
    ellipse(0, -size*0.7, size*0.2, size*0.2);
    fill(150);
    quad(0, -size*0.1, -size*0.2, -size*0.1, -size*0.13, size*0.5, 0, size*0.7);
    fill(110);
    quad(0, -size*0.1, size*0.2, -size*0.1, size*0.13, size*0.5, 0, size*0.7);
    fill(130);
    triangle(0, -size*0.3, -size*0.4, -size*0.1, size*0.4, -size*0.1);
    popMatrix();
    
  }
}
